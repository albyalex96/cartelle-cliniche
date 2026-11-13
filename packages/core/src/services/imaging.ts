import { createHash, randomUUID } from 'node:crypto';
import { ENCAPSULATED_PDF_SOP_CLASS, isDicomFile, readDicomGeometry, readDicomInstance, renderDicomPreview } from '@alby/dicom';
import { idSchema, MAX_DICOM_BYTES, type DicomUploadResultDTO, type ImagingGeometryDTO, type ImagingStudyDetailDTO, type ImagingStudyDTO } from '@alby/shared';
import { requireUser } from '../auth/guard';
import type { RequestContext } from '../context';
import { getPrisma } from '../db';
import type { Prisma } from '../generated/prisma/client';
import { AppError, notFound } from '../errors';
import { encodePng } from '../png';
import { dicomPaths, readStored, removeStored, writeStored } from '../storage';
import { requirePatientPermission } from './access';
import { writeAudit } from './audit';

/**
 * Immagini diagnostiche (DICOM), di solito importate da un CD/DVD.
 * Ogni file viene salvato così com'è nella cartella di archivio; nel database restano
 * studio, serie e immagine con i loro dati descrittivi, letti dal server dal file stesso.
 */

export interface UploadedDicom {
  /** Nome o percorso del file sul disco (solo per segnalare gli errori). */
  name: string;
  bytes: Uint8Array;
}

const parseId = (raw: unknown, what: string) => {
  const id = idSchema.safeParse(raw);
  if (!id.success) throw notFound(what);
  return id.data;
};

const dateOnly = (v?: string) => (v ? new Date(`${v}T00:00:00.000Z`) : null);

/** Nome del file mostrato negli errori: solo l'ultima parte, senza caratteri strani. */
const shortName = (name: string) => (name.split(/[\\/]/).pop() ?? name).replace(/[\u0000-\u001f]/g, '').slice(0, 120);

/**
 * Salva un gruppo di immagini DICOM di un paziente. Il server rilegge ogni file: accetta solo
 * file DICOM veri, ignora le immagini già presenti e i referti PDF incapsulati (vanno nei referti).
 */
export async function uploadDicomFiles(ctx: RequestContext, rawPatientId: unknown, files: UploadedDicom[]): Promise<DicomUploadResultDTO> {
  const authed = requireUser(ctx);
  const patientId = parseId(rawPatientId, 'Paziente');
  await requirePatientPermission(authed, patientId, 'edit');
  const prisma = getPrisma();
  const result: DicomUploadResultDTO = { added: 0, duplicates: 0, rejected: [] };
  const reject = (f: UploadedDicom, reason: string) => result.rejected.push({ name: shortName(f.name), reason });
  // Studi e serie già visti in questo gruppo: evita di cercarli a ogni immagine.
  const studies = new Map<string, string>();
  const series = new Map<string, string>();

  for (const file of files) {
    if (file.bytes.byteLength > MAX_DICOM_BYTES) {
      reject(file, `supera i ${MAX_DICOM_BYTES / 1024 / 1024} MB`);
      continue;
    }
    if (!isDicomFile(file.bytes)) {
      reject(file, 'non è un file DICOM');
      continue;
    }
    const inst = readDicomInstance(file.bytes);
    if (!inst) {
      reject(file, 'file DICOM non leggibile');
      continue;
    }
    if (inst.sopClassUid === ENCAPSULATED_PDF_SOP_CLASS) {
      reject(file, 'è un referto PDF: importalo dai referti');
      continue;
    }
    const sha256 = createHash('sha256').update(file.bytes).digest('hex');
    // Senza identificativo dell'immagine si usa l'impronta del contenuto (stesso file = stessa immagine).
    const sopUid = inst.sopUid ?? `sha256:${sha256}`;

    let studyId = studies.get(inst.studyUid);
    if (!studyId) {
      const existing = await prisma.imagingStudy.findUnique({ where: { patientId_studyUid: { patientId, studyUid: inst.studyUid } } });
      const study = existing
        ? await prisma.imagingStudy.update({
            where: { id: existing.id },
            // Completa i dati mancanti senza sovrascrivere quelli già presenti.
            data: {
              studyDate: existing.studyDate ?? dateOnly(inst.studyDate),
              description: existing.description ?? inst.studyDescription ?? null,
              institution: existing.institution ?? inst.institution ?? null,
              accessionNumber: existing.accessionNumber ?? inst.accessionNumber ?? null,
            },
          })
        : await prisma.imagingStudy.create({
            data: {
              patientId,
              studyUid: inst.studyUid,
              studyDate: dateOnly(inst.studyDate),
              description: inst.studyDescription ?? null,
              institution: inst.institution ?? null,
              accessionNumber: inst.accessionNumber ?? null,
              modalities: [],
              createdById: authed.user.id,
            },
          });
      studyId = study.id;
      studies.set(inst.studyUid, studyId);
    }
    if (inst.modality) {
      const study = await prisma.imagingStudy.findUniqueOrThrow({ where: { id: studyId }, select: { modalities: true } });
      if (!study.modalities.includes(inst.modality)) {
        await prisma.imagingStudy.update({ where: { id: studyId }, data: { modalities: { push: inst.modality } } });
      }
    }

    const seriesKey = `${studyId}:${inst.seriesUid}`;
    let seriesId = series.get(seriesKey);
    if (!seriesId) {
      const s = await prisma.imagingSeries.upsert({
        where: { studyId_seriesUid: { studyId, seriesUid: inst.seriesUid } },
        update: {},
        create: {
          studyId,
          seriesUid: inst.seriesUid,
          number: inst.seriesNumber ?? null,
          modality: inst.modality ?? null,
          description: inst.seriesDescription ?? null,
        },
      });
      seriesId = s.id;
      series.set(seriesKey, seriesId);
    }

    if (await prisma.imagingInstance.findUnique({ where: { seriesId_sopUid: { seriesId, sopUid } }, select: { id: true } })) {
      result.duplicates++;
      continue;
    }

    const id = randomUUID();
    const storagePath = dicomPaths.instance(patientId, studyId, id);
    await writeStored(storagePath, file.bytes);
    try {
      await prisma.imagingInstance.create({
        data: { id, seriesId, sopUid, instanceNumber: inst.instanceNumber ?? null, size: file.bytes.byteLength, sha256, storagePath },
      });
      result.added++;
    } catch (err) {
      // Se il database rifiuta (es. la stessa immagine caricata in parallelo) il file non deve restare orfano.
      await removeStored(storagePath);
      if ((err as { code?: string }).code === 'P2002') result.duplicates++;
      else throw err;
    }
  }

  await writeAudit(ctx, 'imaging.uploaded', {
    entity: 'patient',
    entityId: patientId,
    details: { added: result.added, duplicates: result.duplicates, rejected: result.rejected.length },
  });
  return result;
}

// Ordine di consultazione: serie e immagini per numero (quelle senza numero in fondo).
const seriesOrder: Prisma.ImagingSeriesOrderByWithRelationInput[] = [{ number: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }];
const instanceOrder: Prisma.ImagingInstanceOrderByWithRelationInput[] = [{ instanceNumber: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }, { id: 'asc' }];

export async function listImagingStudies(ctx: RequestContext, rawPatientId: unknown): Promise<ImagingStudyDTO[]> {
  const authed = requireUser(ctx);
  const patientId = parseId(rawPatientId, 'Paziente');
  await requirePatientPermission(authed, patientId, 'view');
  return studySummaries({ patientId });
}

/** Studi di immagini collegati a un referto (per mostrarli accanto al testo). */
export async function listReportImagingStudies(ctx: RequestContext, rawReportId: unknown): Promise<ImagingStudyDTO[]> {
  const authed = requireUser(ctx);
  const reportId = parseId(rawReportId, 'Referto');
  const report = await getPrisma().report.findUnique({ where: { id: reportId }, select: { patientId: true } });
  if (!report) throw notFound('Referto');
  await requirePatientPermission(authed, report.patientId, 'view');
  return studySummaries({ reportId, patientId: report.patientId });
}

async function studySummaries(where: Prisma.ImagingStudyWhereInput): Promise<ImagingStudyDTO[]> {
  const prisma = getPrisma();
  const studies = await prisma.imagingStudy.findMany({
    where,
    orderBy: [{ studyDate: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
    include: {
      series: {
        select: { id: true, instances: { select: { id: true }, orderBy: instanceOrder, take: 1 } },
        orderBy: seriesOrder,
      },
    },
  });
  // Numero e dimensione delle immagini per studio, con una sola query.
  const totals = await prisma.imagingInstance.groupBy({
    by: ['seriesId'],
    where: { series: { studyId: { in: studies.map((s) => s.id) } } },
    _count: { _all: true },
    _sum: { size: true },
  });
  const bySeries = new Map(totals.map((t) => [t.seriesId, t]));
  return studies.map((s) => {
    const t = s.series.map((x) => bySeries.get(x.id));
    return {
      id: s.id,
      studyDate: s.studyDate ? s.studyDate.toISOString().slice(0, 10) : null,
      description: s.description,
      modalities: s.modalities,
      institution: s.institution,
      seriesCount: s.series.length,
      imageCount: t.reduce((n, x) => n + (x?._count._all ?? 0), 0),
      bytes: t.reduce((n, x) => n + (x?._sum.size ?? 0), 0),
      coverInstanceId: s.series.find((x) => x.instances.length)?.instances[0]!.id ?? null,
      reportId: s.reportId,
      createdAt: s.createdAt.toISOString(),
    };
  });
}

/** Uno studio con le sue serie e immagini, per consultarle (viene annotato nel registro). */
export async function getImagingStudy(ctx: RequestContext, rawStudyId: unknown): Promise<ImagingStudyDetailDTO> {
  const authed = requireUser(ctx);
  const id = parseId(rawStudyId, 'Studio');
  const study = await getPrisma().imagingStudy.findUnique({
    where: { id },
    include: {
      series: {
        orderBy: seriesOrder,
        include: { instances: { select: { id: true, instanceNumber: true }, orderBy: instanceOrder } },
      },
      report: { select: { id: true, kind: true, title: true, examDate: true, body: true } },
    },
  });
  if (!study) throw notFound('Studio');
  const permission = await requirePatientPermission(authed, study.patientId, 'view');
  await writeAudit(ctx, 'imaging.study_viewed', { entity: 'imaging_study', entityId: id, details: { patientId: study.patientId } });
  return {
    id: study.id,
    patientId: study.patientId,
    studyDate: study.studyDate ? study.studyDate.toISOString().slice(0, 10) : null,
    description: study.description,
    modalities: study.modalities,
    institution: study.institution,
    series: study.series.map((s) => ({ id: s.id, number: s.number, modality: s.modality, description: s.description, instances: s.instances })),
    report: study.report && { ...study.report, examDate: study.report.examDate.toISOString().slice(0, 10) },
    canEdit: permission === 'edit',
  };
}

/** Collega lo studio a un referto testuale dello stesso paziente (`null` toglie il collegamento). */
export async function linkImagingStudyReport(ctx: RequestContext, rawStudyId: unknown, rawReportId: unknown): Promise<{ patientId: string }> {
  const authed = requireUser(ctx);
  const id = parseId(rawStudyId, 'Studio');
  const prisma = getPrisma();
  const study = await prisma.imagingStudy.findUnique({ where: { id }, select: { patientId: true } });
  if (!study) throw notFound('Studio');
  await requirePatientPermission(authed, study.patientId, 'edit');
  let reportId: string | null = null;
  if (rawReportId !== null && rawReportId !== undefined && rawReportId !== '') {
    reportId = parseId(rawReportId, 'Referto');
    // Solo referti dello stesso paziente: altrimenti si potrebbe leggere il testo di un altro.
    const report = await prisma.report.findFirst({ where: { id: reportId, patientId: study.patientId }, select: { id: true } });
    if (!report) throw notFound('Referto');
  }
  await prisma.imagingStudy.update({ where: { id }, data: { reportId } });
  await writeAudit(ctx, 'imaging.study_linked', { entity: 'imaging_study', entityId: id, details: { patientId: study.patientId, reportId } });
  return { patientId: study.patientId };
}

/**
 * Imposta quali studi di immagini sono collegati a un referto: quelli indicati vengono collegati
 * (anche se prima lo erano a un altro referto), gli altri che lo erano vengono scollegati.
 */
export async function setReportImagingStudies(ctx: RequestContext, rawReportId: unknown, rawStudyIds: unknown): Promise<{ patientId: string }> {
  const authed = requireUser(ctx);
  const reportId = parseId(rawReportId, 'Referto');
  const studyIds = [...new Set(idSchema.array().max(200).parse(rawStudyIds))];
  const prisma = getPrisma();
  const report = await prisma.report.findUnique({ where: { id: reportId }, select: { patientId: true } });
  if (!report) throw notFound('Referto');
  const { patientId } = report;
  await requirePatientPermission(authed, patientId, 'edit');
  // Solo studi dello stesso paziente.
  const found = await prisma.imagingStudy.count({ where: { id: { in: studyIds }, patientId } });
  if (found !== studyIds.length) throw notFound('Studio');
  const [removed, added] = await prisma.$transaction([
    prisma.imagingStudy.updateMany({ where: { reportId, id: { notIn: studyIds } }, data: { reportId: null } }),
    // "Non ancora collegati a questo": in SQL un confronto con un valore mancante non è né vero né falso, quindi va detto a parte.
    prisma.imagingStudy.updateMany({ where: { id: { in: studyIds }, patientId, OR: [{ reportId: null }, { reportId: { not: reportId } }] }, data: { reportId } }),
  ]);
  if (removed.count || added.count) {
    await writeAudit(ctx, 'imaging.study_linked', {
      entity: 'report',
      entityId: reportId,
      details: { patientId, linked: added.count, unlinked: removed.count },
    });
  }
  return { patientId };
}

/** Lato più lungo delle anteprime, in pixel: miniatura per gli elenchi, intera per la consultazione. */
const PREVIEW_SIZES = { thumb: 320, full: 4096 } as const;
export type ImagingPreviewSize = keyof typeof PREVIEW_SIZES;

/**
 * Anteprima (PNG o JPEG) di un'immagine DICOM. Il PNG viene calcolato una volta e conservato
 * accanto al file originale, nella cartella dello studio (eliminata insieme allo studio).
 * La consultazione è annotata nel registro da `getImagingStudy`, non a ogni immagine.
 */
export async function getImagingPreview(
  ctx: RequestContext,
  rawInstanceId: unknown,
  size: ImagingPreviewSize = 'full',
): Promise<{ mimeType: 'image/png' | 'image/jpeg'; data: Uint8Array }> {
  const authed = requireUser(ctx);
  const id = parseId(rawInstanceId, 'Immagine');
  const instance = await getPrisma().imagingInstance.findUnique({
    where: { id },
    select: { storagePath: true, series: { select: { study: { select: { id: true, patientId: true } } } } },
  });
  if (!instance) throw notFound('Immagine');
  const { study } = instance.series;
  await requirePatientPermission(authed, study.patientId, 'view');

  const cachePath = dicomPaths.preview(study.patientId, study.id, id, size);
  try {
    return { mimeType: 'image/png', data: await readStored(cachePath) };
  } catch {
    // Non ancora calcolata.
  }
  const preview = renderDicomPreview(await readStored(instance.storagePath), { maxSize: PREVIEW_SIZES[size] });
  if (!preview) throw new AppError(415, 'Anteprima non disponibile per questo formato di immagine', 'PREVIEW_UNSUPPORTED');
  // Il JPEG è già dentro il file DICOM: si estrae ogni volta, senza copie.
  if (preview.kind === 'jpeg') return { mimeType: 'image/jpeg', data: preview.data };
  const png = encodePng(preview.width, preview.height, preview.channels, preview.pixels);
  await writeStored(cachePath, png);
  return { mimeType: 'image/png', data: png };
}

/**
 * Dimensioni e scala (mm per pixel) di un'immagine, lette dal file originale: servono a misurare
 * le distanze nel visualizzatore. Come per le anteprime, la consultazione è annotata da `getImagingStudy`.
 */
export async function getImagingGeometry(ctx: RequestContext, rawInstanceId: unknown): Promise<ImagingGeometryDTO> {
  const authed = requireUser(ctx);
  const id = parseId(rawInstanceId, 'Immagine');
  const instance = await getPrisma().imagingInstance.findUnique({
    where: { id },
    select: { storagePath: true, series: { select: { study: { select: { patientId: true } } } } },
  });
  if (!instance) throw notFound('Immagine');
  await requirePatientPermission(authed, instance.series.study.patientId, 'view');
  const geometry = readDicomGeometry(await readStored(instance.storagePath));
  if (!geometry) throw new AppError(415, 'Dimensioni non disponibili per questa immagine', 'GEOMETRY_UNSUPPORTED');
  return geometry;
}

/** Elimina uno studio con tutte le sue immagini (anche i file nell'archivio). */
export async function deleteImagingStudy(ctx: RequestContext, rawStudyId: unknown): Promise<{ patientId: string }> {
  const authed = requireUser(ctx);
  const id = parseId(rawStudyId, 'Studio');
  const prisma = getPrisma();
  const study = await prisma.imagingStudy.findUnique({ where: { id }, select: { patientId: true } });
  if (!study) throw notFound('Studio');
  await requirePatientPermission(authed, study.patientId, 'edit');
  await prisma.imagingStudy.delete({ where: { id } });
  await removeStored(dicomPaths.study(study.patientId, id));
  await writeAudit(ctx, 'imaging.study_deleted', { entity: 'imaging_study', entityId: id, details: { patientId: study.patientId } });
  return { patientId: study.patientId };
}
