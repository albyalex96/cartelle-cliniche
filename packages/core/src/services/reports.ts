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
  checkReportFields,
  effectiveReportFields,
  hasLabTable,
  idSchema,
  isStandardReportField,
  MAX_PDF_BYTES,
  parseReportCategories,
  parseReportFields,
  parseReportTemplateIcon,
  pickReportTemplate,
  reportInputSchema,
  SCAN_PARSER_ID,
  standardReportFieldDefs,
  type LabResultDTO,
  type ReportCategory,
  type ReportField,
  usedReportCategories,
  type ReportData,
  type ReportDraftDTO,
  type ReportDTO,
  type ReportSummaryDTO,
  type StoredFileDTO,
  type TherapyPlanDTO,
} from '@alby/shared';
import { z } from 'zod';
import { requireUser } from '../auth/guard';
import type { AuthedContext, RequestContext } from '../context';
import { getPrisma, type Prisma } from '../db';
import { AppError, notFound } from '../errors';
import { requirePatientPermission } from './access';
import { writeAudit } from './audit';
import { isOcrEnabled, SCAN_HINT } from './ocr';
import { describePdfPages } from './report-images';
import { loadReportTemplates } from './report-templates';
import { normalizeForSearch } from './patients';
import { getSettings } from '../settings';

// ───────────────────────────── conversioni ─────────────────────────────

const isoDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const dateOnly = (v: string) => new Date(`${v}T00:00:00.000Z`);

export const reportInclude = {
  file: { select: { id: true, fileName: true, size: true } },
  results: { orderBy: { position: 'asc' } },
  template: { select: { icon: true } },
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

/** Valori dei campi personalizzati letti dal database (solo testi). */
function parseCustom(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw).filter((e): e is [string, string] => typeof e[1] === 'string'));
}

/** Icona del tipo del referto; se il tipo è stato eliminato, quella predefinita per il genere di referto. */
const templateIcon = (r: { kind: ReportRow['kind']; template: { icon: string } | null }) =>
  parseReportTemplateIcon(r.template?.icon, r.kind === 'LABORATORIO' ? [{ type: 'lab_table' }] : []);

export function toReportDTO(r: ReportRow, canEdit: boolean): ReportDTO {
  return {
    id: r.id,
    patientId: r.patientId,
    kind: r.kind,
    templateId: r.templateId,
    templateName: r.templateName,
    templateIcon: templateIcon(r),
    fields: parseReportFields(r.fields),
    categories: parseReportCategories(r.categories),
    custom: parseCustom(r.custom),
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

/**
 * Tipo e campi con cui salvare il referto: quelli del tipo scelto, più quelli (del referto com'era, degli
 * altri tipi o standard) che hanno comunque un valore, così nulla di ciò che si è scritto va perso.
 * Controlla anche i campi obbligatori e i valori dei campi personalizzati.
 * `current`: il referto che si sta modificando (senza tipo scelto conserva il suo).
 */
async function resolveTemplate(input: ReportData, current?: { templateId: string | null; templateName: string; fields: unknown; categories: unknown }) {
  const templates = await loadReportTemplates();
  const previous = current ? parseReportFields(current.fields) : [];
  const previousCategories = current ? parseReportCategories(current.categories) : [];
  let chosen: { id: string | null; name: string; fields: ReportField[]; categories: ReportCategory[] } | undefined;
  if (input.templateId) {
    chosen = templates.find((t) => t.id === input.templateId);
    if (!chosen) throw new AppError(400, 'Il tipo di referto scelto non esiste più', 'BAD_TEMPLATE');
  } else if (input.kind) {
    chosen = pickReportTemplate(templates, input.kind === 'LABORATORIO');
  } else if (current) {
    chosen = { id: current.templateId, name: current.templateName, fields: previous, categories: previousCategories };
  }
  if (!chosen) {
    throw new z.ZodError([{ code: 'custom', path: ['templateId'], message: 'Scegli il tipo di referto', input: undefined }]);
  }

  const fields = effectiveReportFields(chosen.fields, [...previous, ...templates.flatMap((t) => t.fields), ...standardReportFieldDefs()], input);
  const issues = checkReportFields(fields, input);
  if (issues.length) throw new z.ZodError(issues.map((i) => ({ code: 'custom' as const, path: i.path, message: i.message, input: undefined })));

  const custom: Record<string, string> = {};
  for (const f of fields) {
    const value = isStandardReportField(f.key) ? '' : (input.custom[f.key] ?? '').trim();
    if (value) custom[f.key] = value;
  }
  // Categorie dei campi: del tipo scelto e, per i campi tenuti da altrove, di dove venivano.
  const categories = usedReportCategories(fields, chosen.categories, previousCategories, ...templates.map((t) => t.categories));
  return {
    templateId: chosen.id,
    templateName: chosen.name,
    fields,
    categories,
    custom,
    kind: hasLabTable(fields) ? ('LABORATORIO' as const) : ('DESCRITTIVO' as const),
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
  /** Un PDF oppure una foto/scansione JPEG. */
  bytes: Uint8Array;
  /** Solo per le immagini: salvarla come PDF (una pagina) invece che come JPEG. */
  toPdf?: boolean;
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

/** Nome del file con l'estensione giusta per il contenuto salvato (es. "foto.jpeg" convertita → "foto.pdf"). */
const withExtension = (name: string, ext: 'pdf' | 'jpg') => `${name.replace(/\.(pdf|jpe?g)$/i, '')}.${ext}`;

/**
 * Documento da salvare: il PDF così com'è, oppure l'immagine JPEG ripulita (senza metadati né posizione GPS,
 * ruotata dritta) e, se richiesto, messa in un PDF di una pagina.
 */
async function prepareUpload(upload: UploadedPdf): Promise<{ fileName: string; mimeType: string; data: Uint8Array }> {
  const { bytes } = upload;
  const fileName = safeFileName(upload.fileName);
  // Si controlla il contenuto, non l'estensione: un PDF inizia sempre con "%PDF-".
  if (Buffer.from(bytes.subarray(0, 1024)).indexOf('%PDF-') !== -1) return { fileName, mimeType: 'application/pdf', data: bytes };

  const image = await import('@alby/pdf/image');
  if (image.detectImageKind(bytes) !== 'jpeg') throw new AppError(415, 'Il file non è un PDF né un’immagine JPG', 'NOT_PDF');
  let jpeg: Uint8Array;
  try {
    jpeg = (await image.imageToJpeg(bytes)).jpeg;
  } catch (err) {
    if (err instanceof Error && err.name === 'ImageTooLargeError') throw new AppError(415, err.message, 'BAD_IMAGE');
    throw new AppError(415, 'Immagine non leggibile', 'BAD_IMAGE');
  }
  return upload.toPdf
    ? { fileName: withExtension(fileName, 'pdf'), mimeType: 'application/pdf', data: await image.jpegToPdf(jpeg) }
    : { fileName: withExtension(fileName, 'jpg'), mimeType: 'image/jpeg', data: new Uint8Array(jpeg) };
}

/**
 * Il documento come PDF, per leggerlo, disegnarne le pagine o farne l'OCR: un'immagine JPEG viene messa
 * in una pagina al momento, in memoria (il file salvato resta l'immagine).
 */
export async function documentAsPdf(file: { mimeType: string; data: Uint8Array }): Promise<Uint8Array> {
  if (file.mimeType !== 'image/jpeg') return file.data;
  const { jpegToPdf } = await import('@alby/pdf/image');
  return jpegToPdf(file.data);
}

/**
 * Salva il documento di un referto (in attesa di revisione): un PDF o un'immagine JPEG (vedi `prepareUpload`).
 * Se lo stesso file era già stato caricato per questo paziente non lo duplica: lo restituisce,
 * insieme al referto già creato (se c'è).
 */
export async function uploadReportPdf(ctx: RequestContext, rawPatientId: unknown, upload: UploadedPdf): Promise<UploadResult> {
  const authed = requireUser(ctx);
  const patientId = parseId(rawPatientId, 'Paziente');
  await requirePatientPermission(authed, patientId, 'edit');

  if (upload.bytes.byteLength === 0) throw new AppError(400, 'Il file è vuoto', 'EMPTY_FILE');
  if (upload.bytes.byteLength > MAX_PDF_BYTES) {
    throw new AppError(413, `Il file supera i ${MAX_PDF_BYTES / 1024 / 1024} MB`, 'FILE_TOO_LARGE');
  }
  const doc = await prepareUpload(upload);
  const bytes = doc.data;

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
      fileName: doc.fileName,
      mimeType: doc.mimeType,
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

const emptyValues = (templateId = ''): ReportDraftDTO['values'] => ({
  templateId,
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
  custom: {},
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
  const [patient, templates] = await Promise.all([getPrisma().patient.findUniqueOrThrow({ where: { id: patientId } }), loadReportTemplates()]);
  const isLab = extracted.tipo === 'laboratorio';
  const values: ReportDraftDTO['values'] = {
    // Il tipo proposto: il primo con (analisi) o senza (testo libero) la tabella dei valori.
    ...emptyValues(pickReportTemplate(templates, isLab)?.id),
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
  const [first] = await loadReportTemplates();
  const draft: ReportDraftDTO = { file: null, values: emptyValues(first?.id), warnings: [], identity: null, parser: null, scan: null, pages: null };
  if (rawFileId === undefined || rawFileId === null || rawFileId === '') return draft;

  const file = await loadDraftFile(patientId, parseId(rawFileId, 'File'));
  draft.file = { id: file.id, fileName: file.fileName, size: file.size };
  const pdf = await documentAsPdf(file);
  draft.pages = await describePdfPages(pdf);

  let extracted: ExtractedReport;
  try {
    extracted = extractReport(buildLines(await extractPdf(pdf)));
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

/** Il PDF è una scansione (senza testo) da leggere con l'OCR: solo con l'OCR attivo, altrimenti non si guarda nemmeno. */
async function isScanForOcr(data: Uint8Array) {
  if (!isOcrEnabled()) return false;
  try {
    await extractPdf(data);
    return false;
  } catch (err) {
    return err instanceof NoTextLayerError;
  }
}

/**
 * Come mostrare accanto al form di modifica il PDF di un referto (come per un PDF appena caricato):
 * dimensioni delle pagine (per ritagliarne una zona) e, per le scansioni con l'OCR attivo, le pagine su
 * cui selezionare le zone da leggere. Restituisce solo misure, nessun contenuto del documento.
 */
export async function getReportDocument(ctx: RequestContext, rawFileId: unknown): Promise<Pick<ReportDraftDTO, 'scan' | 'pages'>> {
  const authed = requireUser(ctx);
  const id = parseId(rawFileId, 'File');
  const file = await getPrisma().storedFile.findUnique({ where: { id }, select: { patientId: true, mimeType: true, data: true } });
  if (!file) throw notFound('File');
  await requirePatientPermission(authed, file.patientId, 'edit');
  const pdf = await documentAsPdf(file);
  const [pages, scan] = await Promise.all([describePdfPages(pdf), isScanForOcr(pdf)]);
  return { pages, scan: scan && pages ? { pages } : null };
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
      templateName: true,
      template: { select: { icon: true } },
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
    templateName: r.templateName,
    templateIcon: templateIcon(r),
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

/**
 * Piano terapeutico del paziente per la panoramica: tra i referti del tipo scelto nelle impostazioni, quello
 * che scade per ultimo (a parità, o senza scadenza, il più recente). La scadenza è il campo data scelto.
 */
export async function getTherapyPlan(ctx: RequestContext, rawPatientId: unknown): Promise<TherapyPlanDTO> {
  const authed = requireUser(ctx);
  const patientId = parseId(rawPatientId, 'Paziente');
  await requirePatientPermission(authed, patientId, 'view');
  const { therapyPlanTemplateId: templateId, therapyPlanDateField: field } = await getSettings();
  if (!templateId || !field) return { configured: false, report: null };
  const rows = await getPrisma().report.findMany({
    where: { patientId, templateId },
    orderBy: [{ examDate: 'desc' }, { createdAt: 'desc' }],
    select: { id: true, title: true, examDate: true, samplingDate: true, reportDate: true, custom: true },
  });
  const plans = rows.map((r) => {
    const column = field === 'examDate' || field === 'samplingDate' || field === 'reportDate' ? isoDate(r[field]) : parseCustom(r.custom)[field];
    const expiresOn = column && z.iso.date().safeParse(column).success ? column : null;
    return { id: r.id, title: r.title, examDate: isoDate(r.examDate)!, expiresOn };
  });
  // Le date AAAA-MM-GG si confrontano come testo; il primo a pari scadenza è il più recente.
  const latest = plans.reduce<(typeof plans)[number] | null>(
    (best, p) => (!best || (p.expiresOn ?? '') > (best.expiresOn ?? '') ? p : best),
    null,
  );
  return { configured: true, report: latest };
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
  const template = await resolveTemplate(input);
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
      ...template,
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

/**
 * `opts.parser`: se in modifica si è usato l'OCR sul PDF del referto, il referto viene segnato come letto
 * da una scansione. Si accetta solo il lettore dell'OCR e solo per un referto con PDF; senza, il lettore resta.
 */
export async function updateReport(
  ctx: RequestContext,
  rawId: unknown,
  raw: unknown,
  opts: { parser?: { id: string; version: number } | null } = {},
): Promise<ReportDTO> {
  const authed = requireUser(ctx);
  const { report: current } = await loadReport(authed, rawId, 'edit');
  const input = reportInputSchema.parse(raw);
  const template = await resolveTemplate(input, current);
  const scan = current.fileId && opts.parser?.id === SCAN_PARSER_ID ? opts.parser : null;
  const prisma = getPrisma();
  // I valori vengono riscritti tutti: più semplice e affidabile che confrontarli uno per uno.
  const [, report] = await prisma.$transaction([
    prisma.labResult.deleteMany({ where: { reportId: current.id } }),
    prisma.report.update({
      where: { id: current.id },
      data: {
        ...toReportData(input),
        ...template,
        ...(scan && { parserId: scan.id, parserVersion: scan.version }),
        results: { create: toResultRows(input) },
      },
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
