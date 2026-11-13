import { createHash } from 'node:crypto';
import {
  buildLines,
  extractPdf,
  extractReport,
  GENERIC_PARSER,
  isOutOfRange,
  NoTextLayerError,
  parseItalianNumber,
  type ExtractedReport,
} from '@alby/pdf';
import {
  idSchema,
  MAX_PDF_BYTES,
  reportInputSchema,
  SCAN_PARSER_ID,
  type LabResultDTO,
  type ReportData,
  type ReportDraftDTO,
  type ReportDTO,
  type ReportSummaryDTO,
  type StoredFileDTO,
} from '@alby/shared';
import { requireUser } from '../auth/guard';
import type { AuthedContext, RequestContext } from '../context';
import { getPrisma, type Prisma } from '../db';
import { AppError, notFound } from '../errors';
import { requirePatientPermission } from './access';
import { writeAudit } from './audit';
import { isOcrEnabled, SCAN_HINT } from './ocr';
import { describePdfPages } from './report-images';
import { normalizeForSearch } from './patients';

// ───────────────────────────── conversioni ─────────────────────────────

const isoDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const dateOnly = (v: string) => new Date(`${v}T00:00:00.000Z`);

const reportInclude = {
  file: { select: { id: true, fileName: true, size: true } },
  results: { orderBy: { position: 'asc' } },
} satisfies Prisma.ReportInclude;
type ReportRow = Prisma.ReportGetPayload<{ include: typeof reportInclude }>;

function toLabResultDTO(r: ReportRow['results'][number]): LabResultDTO {
  return {
    id: r.id,
    section: r.section,
    name: r.name,
    value: r.value,
    numericValue: r.numericValue,
    unit: r.unit,
    referenceRange: r.referenceRange,
    outOfRange: r.outOfRange,
  };
}

function toReportDTO(r: ReportRow, canEdit: boolean): ReportDTO {
  return {
    id: r.id,
    patientId: r.patientId,
    kind: r.kind,
    title: r.title,
    examDate: isoDate(r.examDate)!,
    samplingDate: isoDate(r.samplingDate),
    reportDate: isoDate(r.reportDate),
    reportNumber: r.reportNumber,
    facility: r.facility,
    doctor: r.doctor,
    doctorRole: r.doctorRole,
    body: r.body,
    notes: r.notes,
    parserId: r.parserId,
    parserVersion: r.parserVersion,
    file: r.file,
    hasFile: !!r.file,
    fileId: r.file?.id ?? null,
    results: r.results.map(toLabResultDTO),
    resultCount: r.results.length,
    outOfRangeCount: r.results.filter((x) => x.outOfRange).length,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    canEdit,
  };
}

/** Dati del form → righe del database. Il valore numerico e il "fuori range" li calcola il server. */
function toResultRows(input: ReportData) {
  return input.results.map((r, position) => {
    const numericValue = parseItalianNumber(r.value) ?? null;
    return {
      position,
      section: r.section,
      name: r.name,
      value: r.value,
      numericValue,
      unit: r.unit,
      referenceRange: r.referenceRange,
      outOfRange: r.outOfRange ?? isOutOfRange(numericValue ?? undefined, r.referenceRange ?? undefined) ?? null,
    };
  });
}

function toReportData(input: ReportData) {
  return {
    kind: input.kind,
    title: input.title,
    examDate: dateOnly(input.examDate),
    samplingDate: input.samplingDate ? dateOnly(input.samplingDate) : null,
    reportDate: input.reportDate ? dateOnly(input.reportDate) : null,
    reportNumber: input.reportNumber,
    facility: input.facility,
    doctor: input.doctor,
    doctorRole: input.doctorRole,
    body: input.body,
    notes: input.notes,
  };
}

const parseId = (raw: unknown, what: string) => {
  const id = idSchema.safeParse(raw);
  if (!id.success) throw notFound(what);
  return id.data;
};

/** Legge un referto e verifica il permesso sul suo paziente. Senza accesso: "non trovato". */
async function loadReport(ctx: AuthedContext, rawId: unknown, level: 'view' | 'edit') {
  const id = parseId(rawId, 'Referto');
  const report = await getPrisma().report.findUnique({ where: { id }, include: reportInclude });
  if (!report) throw notFound('Referto');
  const permission = await requirePatientPermission(ctx, report.patientId, level);
  return { report, permission };
}

// ───────────────────────────── PDF caricati ─────────────────────────────

export interface UploadedPdf {
  fileName: string;
  bytes: Uint8Array;
}

export interface UploadResult {
  file: StoredFileDTO;
  /** Lo stesso PDF era già stato importato per questo paziente: id del referto esistente. */
  existingReportId: string | null;
}

/** Nome del file ripulito: niente percorsi né caratteri di controllo. */
function safeFileName(name: string) {
  const base = name.split(/[\\/]/).pop() ?? '';
  const clean = base.replace(/[\u0000-\u001f\u007f"<>|*?:]/g, '').trim().slice(0, 200);
  return clean || 'referto.pdf';
}

/**
 * Salva il PDF di un referto (in attesa di revisione). Se lo stesso file era già stato caricato
 * per questo paziente non lo duplica: lo restituisce, insieme al referto già creato (se c'è).
 */
export async function uploadReportPdf(ctx: RequestContext, rawPatientId: unknown, upload: UploadedPdf): Promise<UploadResult> {
  const authed = requireUser(ctx);
  const patientId = parseId(rawPatientId, 'Paziente');
  await requirePatientPermission(authed, patientId, 'edit');

  const { bytes } = upload;
  if (bytes.byteLength === 0) throw new AppError(400, 'Il file è vuoto', 'EMPTY_FILE');
  if (bytes.byteLength > MAX_PDF_BYTES) {
    throw new AppError(413, `Il file supera i ${MAX_PDF_BYTES / 1024 / 1024} MB`, 'FILE_TOO_LARGE');
  }
  // Si controlla il contenuto, non l'estensione: un PDF inizia sempre con "%PDF-".
  if (Buffer.from(bytes.subarray(0, 1024)).indexOf('%PDF-') === -1) {
    throw new AppError(415, 'Il file non è un PDF', 'NOT_PDF');
  }

  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const prisma = getPrisma();
  const existing = await prisma.storedFile.findUnique({
    where: { patientId_sha256: { patientId, sha256 } },
    select: { id: true, fileName: true, size: true, report: { select: { id: true } } },
  });
  if (existing) {
    return { file: { id: existing.id, fileName: existing.fileName, size: existing.size }, existingReportId: existing.report?.id ?? null };
  }

  const file = await prisma.storedFile.create({
    data: {
      patientId,
      fileName: safeFileName(upload.fileName),
      mimeType: 'application/pdf',
      size: bytes.byteLength,
      sha256,
      data: new Uint8Array(bytes),
      createdById: authed.user.id,
    },
    select: { id: true, fileName: true, size: true },
  });
  await writeAudit(ctx, 'report.file_uploaded', { entity: 'file', entityId: file.id, details: { patientId, size: file.size } });
  return { file, existingReportId: null };
}

/** Contenuto di un PDF, per mostrarlo nel browser (registra la consultazione). */
export async function getReportPdf(ctx: RequestContext, rawFileId: unknown) {
  const authed = requireUser(ctx);
  const id = parseId(rawFileId, 'File');
  const file = await getPrisma().storedFile.findUnique({ where: { id } });
  if (!file) throw notFound('File');
  await requirePatientPermission(authed, file.patientId, 'view');
  await writeAudit(ctx, 'report.file_viewed', { entity: 'file', entityId: file.id, details: { patientId: file.patientId } });
  return { fileName: file.fileName, mimeType: file.mimeType, data: file.data };
}

/** Elimina un PDF caricato ma non ancora diventato referto (l'utente ha annullato l'importazione). */
export async function discardReportPdf(ctx: RequestContext, rawFileId: unknown): Promise<{ patientId: string }> {
  const authed = requireUser(ctx);
  const id = parseId(rawFileId, 'File');
  const prisma = getPrisma();
  const file = await prisma.storedFile.findUnique({ where: { id }, select: { patientId: true, report: { select: { id: true } } } });
  if (!file) throw notFound('File');
  await requirePatientPermission(authed, file.patientId, 'edit');
  if (file.report) throw new AppError(409, 'Questo PDF appartiene a un referto: elimina il referto', 'FILE_IN_USE');
  await prisma.storedFile.delete({ where: { id } });
  await writeAudit(ctx, 'report.file_discarded', { entity: 'file', entityId: id, details: { patientId: file.patientId } });
  return { patientId: file.patientId };
}

// ───────────────────────────── proposta dal PDF ─────────────────────────────

const words = (s: string) => new Set(normalizeForSearch(s).split(' ').filter((w) => w.length > 1));

/** Il PDF è davvero di questo paziente? Confronta codice fiscale, poi nome e data di nascita. */
function checkIdentity(
  patient: { firstName: string; lastName: string; fiscalCode: string | null; birthDate: Date | null },
  found: ExtractedReport['paziente'],
): ReportDraftDTO['identity'] {
  if (found.codiceFiscale && patient.fiscalCode) {
    return found.codiceFiscale === patient.fiscalCode
      ? { status: 'ok', message: 'Il codice fiscale nel PDF corrisponde a quello del paziente.' }
      : { status: 'mismatch', message: 'Il codice fiscale nel PDF è diverso da quello del paziente: controlla di aver scelto la persona giusta.' };
  }
  const issues: string[] = [];
  let matches = 0;
  if (found.nomeCompleto) {
    const inPdf = words(found.nomeCompleto);
    const expected = [...words(`${patient.firstName} ${patient.lastName}`)];
    if (expected.every((w) => inPdf.has(w))) matches++;
    else issues.push('il nome');
  }
  if (found.dataNascita && patient.birthDate) {
    if (found.dataNascita === isoDate(patient.birthDate)) matches++;
    else issues.push('la data di nascita');
  }
  if (issues.length) {
    return { status: 'mismatch', message: `Nel PDF ${issues.join(' e ')} non corrisponde al paziente: controlla di aver scelto la persona giusta.` };
  }
  return matches
    ? { status: 'ok', message: 'Nome e dati anagrafici nel PDF corrispondono al paziente.' }
    : { status: 'unknown', message: 'Nel PDF non ho trovato dati anagrafici da confrontare: controlla che sia del paziente giusto.' };
}

const emptyValues = (): ReportDraftDTO['values'] => ({
  kind: 'LABORATORIO',
  title: '',
  examDate: '',
  samplingDate: '',
  reportDate: '',
  reportNumber: '',
  facility: '',
  doctor: '',
  doctorRole: '',
  body: '',
  notes: '',
  results: [],
});

/** Risultato di un estrattore → righe della tabella dei valori del form. */
export function toDraftRows(results: ExtractedReport['risultati']): ReportDraftDTO['values']['results'] {
  return results.map((r) => ({
    section: r.sezione ?? '',
    name: r.nome,
    value: r.valore,
    unit: r.unita ?? '',
    referenceRange: r.riferimento ?? '',
    outOfRange: r.fuoriRange ?? null,
  }));
}

/** Referto letto (da un PDF con testo o dall'OCR di una pagina) → valori del form e controllo del paziente. */
export async function draftFromExtracted(patientId: string, extracted: ExtractedReport) {
  const patient = await getPrisma().patient.findUniqueOrThrow({ where: { id: patientId } });
  const isLab = extracted.tipo === 'laboratorio';
  const values: ReportDraftDTO['values'] = {
    ...emptyValues(),
    kind: isLab ? 'LABORATORIO' : 'DESCRITTIVO',
    title: extracted.titolo ?? (isLab ? 'Esami di laboratorio' : ''),
    examDate: extracted.dataEsame ?? '',
    samplingDate: extracted.dataPrelievo ?? '',
    reportDate: extracted.dataReferto ?? '',
    reportNumber: extracted.numeroReferto ?? '',
    doctor: extracted.medico ?? '',
    doctorRole: extracted.qualificaMedico ?? '',
    body: extracted.testo ?? '',
    results: toDraftRows(extracted.risultati),
  };
  return { values, identity: checkIdentity(patient, extracted.paziente) };
}

/**
 * PDF di QUESTO paziente, in revisione o già collegato a un referto (per leggerne o ritagliarne una zona
 * mentre si compila o si modifica il referto). Il permesso sul paziente lo verifica chi chiama.
 */
export async function loadPatientFile(patientId: string, fileId: string) {
  const file = await getPrisma().storedFile.findUnique({ where: { id: fileId }, include: { report: { select: { id: true } } } });
  // Non si leggono PDF di altri pazienti passando un id a mano.
  if (!file || file.patientId !== patientId) throw notFound('File');
  return file;
}

/** PDF da importare: deve appartenere a QUESTO paziente e non essere già diventato un referto. */
export async function loadDraftFile(patientId: string, fileId: string) {
  const file = await loadPatientFile(patientId, fileId);
  if (file.report) throw new AppError(409, 'Questo PDF è già stato importato', 'ALREADY_IMPORTED');
  return file;
}

/**
 * Prepara il form di inserimento: vuoto (inserimento a mano) oppure precompilato leggendo il PDF.
 * Per le scansioni (con l'OCR attivo) il form resta vuoto: l'utente sceglie sul documento le zone da leggere.
 * Nulla viene salvato qui: la proposta va rivista dall'utente.
 */
export async function prepareReportDraft(ctx: RequestContext, rawPatientId: unknown, rawFileId?: unknown): Promise<ReportDraftDTO> {
  const authed = requireUser(ctx);
  const patientId = parseId(rawPatientId, 'Paziente');
  await requirePatientPermission(authed, patientId, 'edit');
  const draft: ReportDraftDTO = { file: null, values: emptyValues(), warnings: [], identity: null, parser: null, scan: null, pages: null };
  if (rawFileId === undefined || rawFileId === null || rawFileId === '') return draft;

  const file = await loadDraftFile(patientId, parseId(rawFileId, 'File'));
  draft.file = { id: file.id, fileName: file.fileName, size: file.size };
  draft.pages = await describePdfPages(file.data);

  let extracted: ExtractedReport;
  try {
    extracted = extractReport(buildLines(await extractPdf(file.data)));
  } catch (err) {
    if (err instanceof NoTextLayerError && isOcrEnabled() && draft.pages) {
      draft.scan = { pages: draft.pages };
      draft.warnings.push(SCAN_HINT);
      return draft;
    }
    draft.warnings.push(
      err instanceof NoTextLayerError
        ? 'Il PDF non contiene testo selezionabile (è una scansione): compila i campi guardando il documento a destra.'
        : 'Non sono riuscito a leggere il PDF: compila i campi guardando il documento a destra.',
    );
    return draft;
  }

  const { values, identity } = await draftFromExtracted(patientId, extracted);
  draft.values = values;
  draft.identity = identity;
  draft.parser = { id: extracted.parser.id, version: extracted.parser.versione };
  draft.warnings.push(...extracted.avvisi);
  return draft;
}

// ───────────────────────────── referti ─────────────────────────────

export async function listReports(ctx: RequestContext, rawPatientId: unknown): Promise<ReportSummaryDTO[]> {
  const authed = requireUser(ctx);
  const patientId = parseId(rawPatientId, 'Paziente');
  await requirePatientPermission(authed, patientId, 'view');
  const rows = await getPrisma().report.findMany({
    where: { patientId },
    orderBy: [{ examDate: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      kind: true,
      title: true,
      examDate: true,
      facility: true,
      doctor: true,
      fileId: true,
      results: { select: { outOfRange: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    examDate: isoDate(r.examDate)!,
    facility: r.facility,
    doctor: r.doctor,
    resultCount: r.results.length,
    outOfRangeCount: r.results.filter((x) => x.outOfRange).length,
    hasFile: !!r.fileId,
    fileId: r.fileId,
  }));
}

export async function getReport(ctx: RequestContext, rawId: unknown): Promise<ReportDTO> {
  const authed = requireUser(ctx);
  const { report, permission } = await loadReport(authed, rawId, 'view');
  await writeAudit(ctx, 'report.viewed', { entity: 'report', entityId: report.id, details: { patientId: report.patientId } });
  return toReportDTO(report, permission === 'edit');
}

export interface CreateReportOptions {
  /** PDF da cui è stato importato (caricato prima con `uploadReportPdf`). */
  fileId?: string | null;
  parser?: { id: string; version: number } | null;
}

export async function createReport(ctx: RequestContext, rawPatientId: unknown, raw: unknown, opts: CreateReportOptions = {}): Promise<ReportDTO> {
  const authed = requireUser(ctx);
  const patientId = parseId(rawPatientId, 'Paziente');
  await requirePatientPermission(authed, patientId, 'edit');
  const input = reportInputSchema.parse(raw);
  const prisma = getPrisma();

  let fileId: string | null = null;
  if (opts.fileId) {
    fileId = parseId(opts.fileId, 'File');
    const file = await prisma.storedFile.findUnique({ where: { id: fileId }, select: { patientId: true, report: { select: { id: true } } } });
    if (!file || file.patientId !== patientId) throw notFound('File');
    if (file.report) throw new AppError(409, 'Questo PDF è già stato importato', 'ALREADY_IMPORTED');
  }
  // Solo estrattori conosciuti: il dato serve a capire, in futuro, quale lettore ha prodotto il referto.
  const parser = fileId && (opts.parser?.id === GENERIC_PARSER.id || opts.parser?.id === SCAN_PARSER_ID) ? opts.parser : null;

  const report = await prisma.report.create({
    data: {
      ...toReportData(input),
      patientId,
      fileId,
      parserId: parser?.id ?? null,
      parserVersion: parser?.version ?? null,
      createdById: authed.user.id,
      results: { create: toResultRows(input) },
    },
    include: reportInclude,
  });
  await writeAudit(ctx, 'report.created', {
    entity: 'report',
    entityId: report.id,
    details: { patientId, fromPdf: !!fileId, results: report.results.length },
  });
  return toReportDTO(report, true);
}

export async function updateReport(ctx: RequestContext, rawId: unknown, raw: unknown): Promise<ReportDTO> {
  const authed = requireUser(ctx);
  const { report: current } = await loadReport(authed, rawId, 'edit');
  const input = reportInputSchema.parse(raw);
  const prisma = getPrisma();
  // I valori vengono riscritti tutti: più semplice e affidabile che confrontarli uno per uno.
  const [, report] = await prisma.$transaction([
    prisma.labResult.deleteMany({ where: { reportId: current.id } }),
    prisma.report.update({
      where: { id: current.id },
      data: { ...toReportData(input), results: { create: toResultRows(input) } },
      include: reportInclude,
    }),
  ]);
  await writeAudit(ctx, 'report.updated', { entity: 'report', entityId: report.id, details: { patientId: report.patientId } });
  return toReportDTO(report, true);
}

/** Elimina il referto, i suoi valori e il PDF collegato. */
export async function deleteReport(ctx: RequestContext, rawId: unknown): Promise<{ patientId: string }> {
  const authed = requireUser(ctx);
  const { report } = await loadReport(authed, rawId, 'edit');
  const prisma = getPrisma();
  await prisma.$transaction([
    prisma.report.delete({ where: { id: report.id } }),
    ...(report.fileId ? [prisma.storedFile.delete({ where: { id: report.fileId } })] : []),
  ]);
  await writeAudit(ctx, 'report.deleted', { entity: 'report', entityId: report.id, details: { patientId: report.patientId } });
  return { patientId: report.patientId };
}
