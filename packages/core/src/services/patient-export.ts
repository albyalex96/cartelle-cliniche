import { renderRecordPdf, renderReportPdf, type RecordBlock, type RecordSection } from '@alby/pdf';
import {
  idSchema,
  isBlockReportField,
  patientExportSchema,
  REPORT_KIND_LABELS,
  reportFieldValue,
  richTextToPlain,
  SEX_LABELS,
  type ReportDTO,
  type ReportField,
} from '@alby/shared';
import { requireUser } from '../auth/guard';
import type { RequestContext } from '../context';
import { getPrisma, type Prisma } from '../db';
import { notFound } from '../errors';
import { readStored } from '../storage';
import { zipStream, type ZipEntry } from '../zip';
import { requirePatientPermission } from './access';
import { writeAudit } from './audit';
import { loadReport, reportInclude, toReportDTO } from './reports';

/**
 * Cartella clinica di un paziente da scaricare: un archivio ZIP con il riepilogo in PDF (anagrafica, terapie,
 * referti con i loro valori, elenco delle immagini) del periodo scelto e, a richiesta, i PDF originali dei
 * referti e le immagini diagnostiche (file DICOM così come sono stati caricati).
 */

const italianDate = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
const isoDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const dateOnly = (v: string) => new Date(`${v}T00:00:00.000Z`);
/** AAAA-MM-GG → GG/MM/AAAA */
const shown = (iso: string | null | undefined) => (iso ? italianDate.format(dateOnly(iso)) : '');

/** Nome di file o cartella valido su ogni sistema: niente separatori o caratteri riservati, non troppo lungo. */
const safeName = (text: string) =>
  text
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
    .slice(0, 80) || 'senza nome';

/** Periodo come filtro su una colonna data (estremi compresi; senza date nessun limite). */
const dateRange = (from: string | null, to: string | null): Prisma.DateTimeFilter | undefined =>
  from || to ? { ...(from ? { gte: dateOnly(from) } : {}), ...(to ? { lte: dateOnly(to) } : {}) } : undefined;

/** Valore di un campo breve come va stampato ('' = da non stampare). */
function fieldText(f: ReportField, report: ReportDTO): string {
  const value = reportFieldValue(f, report);
  if (f.type === 'date') return shown(value) || value;
  if (f.type === 'checkbox') return value === 'true' ? 'Sì' : '';
  return value;
}

/** Contenuto di un referto nel riepilogo: campi brevi, testi e tabella dei valori, nell'ordine del tipo. */
function reportBlocks(report: ReportDTO, pdfPath: string | null): RecordBlock[] {
  const sub = [report.templateName || REPORT_KIND_LABELS[report.kind], shown(report.examDate), report.facility].filter(Boolean).join(' · ');
  const blocks: RecordBlock[] = [{ type: 'heading', text: report.title, sub }];
  const fields = report.fields.filter((f) => f.key !== 'facility');
  const items = fields
    .filter((f) => !isBlockReportField(f))
    .map((f) => ({ label: f.label, value: fieldText(f, report) }))
    .filter((i) => i.value);
  if (pdfPath) items.push({ label: 'PDF originale', value: pdfPath });
  if (items.length) blocks.push({ type: 'fields', items });
  for (const f of fields.filter(isBlockReportField)) {
    if (f.type === 'lab_table') {
      if (!report.results.length) continue;
      let section: string | null = null;
      const rows = report.results.flatMap((r) => {
        const group = r.section && r.section !== section ? [{ cells: [r.section], group: true }] : [];
        section = r.section;
        return [...group, { cells: [r.name, r.value, r.unit ?? '', r.referenceRange ?? ''], flagged: r.outOfRange === true }];
      });
      blocks.push({
        type: 'table',
        label: report.outOfRangeCount ? `${f.label} (in rosso i ${report.outOfRangeCount} fuori dai valori di riferimento)` : f.label,
        columns: [
          { title: 'Esame', width: 0.38 },
          { title: 'Valore', width: 0.17 },
          { title: 'Unità', width: 0.15 },
          { title: 'Riferimento', width: 0.3 },
        ],
        rows,
      });
    } else {
      const value = reportFieldValue(f, report);
      const text = f.type === 'rich_text' ? richTextToPlain(value) : value;
      if (text.trim()) blocks.push({ type: 'text', label: f.label, text });
    }
  }
  if (report.notes?.trim()) blocks.push({ type: 'text', label: 'Note', text: report.notes });
  return blocks;
}

export async function exportPatientRecord(
  ctx: RequestContext,
  rawPatientId: unknown,
  rawOptions: unknown,
): Promise<{ fileName: string; stream: ReadableStream<Uint8Array> }> {
  const authed = requireUser(ctx);
  const id = idSchema.safeParse(rawPatientId);
  if (!id.success) throw notFound('Paziente');
  const patientId = id.data;
  await requirePatientPermission(authed, patientId, 'view');
  const options = patientExportSchema.parse(rawOptions ?? {});
  const prisma = getPrisma();

  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient) throw notFound('Paziente');
  const range = dateRange(options.from, options.to);
  const [reportRows, medications, studies] = await Promise.all([
    prisma.report.findMany({
      where: { patientId, ...(range ? { examDate: range } : {}) },
      orderBy: [{ examDate: 'desc' }, { createdAt: 'desc' }],
      include: reportInclude,
    }),
    // Le terapie che nel periodo erano in corso almeno un giorno.
    prisma.medication.findMany({
      where: {
        patientId,
        AND: [
          options.to ? { OR: [{ startDate: null }, { startDate: { lte: dateOnly(options.to) } }] } : {},
          options.from ? { OR: [{ endDate: null }, { endDate: { gte: dateOnly(options.from) } }] } : {},
        ],
      },
      orderBy: [{ startDate: { sort: 'desc', nulls: 'last' } }, { name: 'asc' }],
    }),
    // Gli studi senza data valgono per il giorno in cui sono stati caricati.
    prisma.imagingStudy.findMany({
      where: { patientId, ...(range ? { OR: [{ studyDate: range }, { studyDate: null, createdAt: range }] } : {}) },
      orderBy: [{ studyDate: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      include: {
        series: {
          orderBy: [{ number: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
          include: {
            instances: {
              select: { id: true, storagePath: true, createdAt: true },
              orderBy: [{ instanceNumber: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }, { id: 'asc' }],
            },
          },
        },
      },
    }),
  ]);
  const reports = reportRows.map((r) => toReportDTO(r, false));

  // Percorsi dentro l'archivio: data e nome, così i file si ritrovano in ordine.
  // I documenti caricati come foto (non convertite in PDF) mantengono l'estensione dell'immagine.
  const extension = new Map(reportRows.map((r) => [r.id, r.file?.mimeType === 'image/jpeg' ? 'jpg' : 'pdf']));
  const pdfPaths = new Map(
    reports.filter((r) => options.pdf && r.file).map((r) => [r.id, `Referti/${r.examDate} ${safeName(r.title)}.${extension.get(r.id)}`] as const),
  );
  const studyFolder = (s: (typeof studies)[number]) =>
    `Immagini/${isoDate(s.studyDate) ?? 'senza data'} ${safeName(s.description || s.modalities.join(' ') || 'studio')}`;

  const now = new Date();
  const fullName = `${patient.firstName} ${patient.lastName}`;
  const period =
    options.from && options.to
      ? `Dal ${shown(options.from)} al ${shown(options.to)}`
      : options.from
        ? `Dal ${shown(options.from)}`
        : options.to
          ? `Fino al ${shown(options.to)}`
          : 'Tutto lo storico';

  const sections: RecordSection[] = [
    {
      title: 'Dati anagrafici',
      blocks: [
        {
          type: 'fields',
          items: [
            { label: 'Nome e cognome', value: fullName },
            { label: 'Data di nascita', value: shown(isoDate(patient.birthDate)) },
            { label: 'Sesso', value: patient.sex ? SEX_LABELS[patient.sex] : '' },
            { label: 'Codice fiscale', value: patient.fiscalCode ?? '' },
            { label: 'Gruppo sanguigno', value: patient.bloodType ?? '' },
            { label: 'Telefono', value: patient.phone ?? '' },
            { label: 'Email', value: patient.email ?? '' },
          ].filter((i) => i.value),
        },
        ...(patient.notes?.trim() ? [{ type: 'text' as const, label: 'Note', text: patient.notes }] : []),
      ],
    },
    {
      title: 'Terapie',
      blocks: medications.length
        ? [
            {
              type: 'table',
              columns: [
                { title: 'Farmaco', width: 0.36 },
                { title: 'Dose', width: 0.17 },
                { title: 'Frequenza', width: 0.22 },
                { title: 'Periodo', width: 0.25 },
              ],
              rows: medications.map((m) => ({
                cells: [
                  [[m.name, m.strength].filter(Boolean).join(' '), m.form, m.reason && `per ${m.reason}`].filter(Boolean).join(' · '),
                  m.dosage ?? '',
                  [m.frequency, m.asNeeded && 'al bisogno'].filter(Boolean).join(', '),
                  m.startDate
                    ? `dal ${shown(isoDate(m.startDate))}${m.endDate ? ` al ${shown(isoDate(m.endDate))}` : ''}`
                    : m.endDate
                      ? `fino al ${shown(isoDate(m.endDate))}`
                      : '',
                ],
              })),
            },
          ]
        : [{ type: 'note', text: 'Nessuna terapia nel periodo.' }],
    },
    {
      title: `Referti (${reports.length})`,
      blocks: reports.length ? reports.flatMap((r) => reportBlocks(r, pdfPaths.get(r.id) ?? null)) : [{ type: 'note', text: 'Nessun referto nel periodo.' }],
    },
    {
      title: `Immagini (${studies.length})`,
      blocks: studies.length
        ? studies.flatMap((s): RecordBlock[] => {
            const images = s.series.reduce((n, x) => n + x.instances.length, 0);
            const items = [
              { label: 'Esame', value: s.modalities.join(', ') },
              { label: 'Struttura', value: s.institution ?? '' },
              { label: 'Contenuto', value: `${s.series.length} serie, ${images} ${images === 1 ? 'immagine' : 'immagini'}` },
              { label: 'File DICOM', value: options.images ? `${studyFolder(s)}/` : '' },
            ].filter((i) => i.value);
            return [
              { type: 'heading', text: s.description || 'Studio di immagini', sub: s.studyDate ? shown(isoDate(s.studyDate)) : `Senza data (caricato il ${italianDate.format(s.createdAt)})` },
              { type: 'fields', items },
            ];
          })
        : [{ type: 'note', text: 'Nessuno studio di immagini nel periodo.' }],
    },
  ];

  const summary = await renderRecordPdf({ patientName: fullName, subtitle: `${period} · Stampata il ${italianDate.format(now)}`, sections });

  async function* entries(): AsyncGenerator<ZipEntry> {
    yield { name: 'Cartella clinica.pdf', date: now, data: async () => summary };
    for (const r of reports) {
      const name = pdfPaths.get(r.id);
      if (!name || !r.fileId) continue;
      const fileId = r.fileId;
      yield {
        name,
        date: dateOnly(r.examDate),
        data: async () => (await prisma.storedFile.findUniqueOrThrow({ where: { id: fileId }, select: { data: true } })).data,
      };
    }
    if (!options.images) return;
    for (const s of studies) {
      const folder = studyFolder(s);
      for (const [i, series] of s.series.entries()) {
        const seriesFolder = `${folder}/Serie ${series.number ?? i + 1}${series.description ? ` ${safeName(series.description)}` : ''}`;
        const digits = String(series.instances.length).length;
        for (const [n, inst] of series.instances.entries()) {
          yield { name: `${seriesFolder}/${String(n + 1).padStart(digits, '0')}.dcm`, date: inst.createdAt, data: () => readStored(inst.storagePath) };
        }
      }
    }
  }

  await writeAudit(ctx, 'patient.exported', {
    entity: 'patient',
    entityId: patientId,
    details: { from: options.from, to: options.to, pdf: options.pdf, images: options.images, reports: reports.length, studies: studies.length },
  });
  const day = now.toISOString().slice(0, 10);
  return { fileName: `Cartella clinica ${safeName(`${patient.lastName} ${patient.firstName}`)} ${day}.zip`, stream: zipStream(entries()) };
}

const generatedAt = new Intl.DateTimeFormat('it-IT', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Rome' });

/** Età compiuta alla data indicata (AAAA-MM-GG). */
function ageAt(birth: string, on: string): number {
  const [by, bm, bd] = birth.split('-').map(Number) as [number, number, number];
  const [y, m, d] = on.split('-').map(Number) as [number, number, number];
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

/**
 * Un referto come PDF impaginato (intestazione, paziente, campi, valori), da stampare o condividere.
 * È una copia leggibile dei dati registrati: il PDF originale, se c'è, resta quello da `getReportPdf`.
 */
export async function exportReportPdf(ctx: RequestContext, rawReportId: unknown): Promise<{ fileName: string; data: Uint8Array }> {
  const authed = requireUser(ctx);
  const { report: row } = await loadReport(authed, rawReportId, 'view');
  const patient = await getPrisma().patient.findUnique({ where: { id: row.patientId } });
  if (!patient) throw notFound('Paziente');
  const report = toReportDTO(row, false);
  const birth = isoDate(patient.birthDate);
  const data = await renderReportPdf({
    title: report.title,
    kind: report.templateName || REPORT_KIND_LABELS[report.kind],
    examDate: report.examDate,
    facility: report.facility,
    patient: {
      name: `${patient.firstName} ${patient.lastName}`,
      items: [
        { label: 'Data di nascita', value: birth ? `${shown(birth)} (${ageAt(birth, report.examDate)} anni all’esame)` : '' },
        { label: 'Sesso', value: patient.sex ? SEX_LABELS[patient.sex] : '' },
        { label: 'Codice fiscale', value: patient.fiscalCode ?? '' },
      ],
    },
    summary: { results: report.results.length, outOfRange: report.outOfRangeCount },
    blocks: reportBlocks(report, null),
    generatedAt: generatedAt.format(new Date()).replace(', ', ' alle '),
  });
  await writeAudit(ctx, 'report.exported', { entity: 'report', entityId: report.id, details: { patientId: report.patientId } });
  return { fileName: `${report.examDate} ${safeName(report.title)}.pdf`, data };
}
