import {
  checkReportFields,
  isStandardReportField,
  STANDARD_REPORT_FIELD_KEYS,
  type MobileDraftResponseDTO,
  type ReportDraftDTO,
  type ReportDTO,
  type ReportField,
  type ScanReadDTO,
} from '@alby/shared';
import { ApiError } from './api';

/**
 * Nuovo referto dall'app (solo online), come il modal "Inserisci referto" della webapp:
 * il documento (foto o PDF) va sul server, che lo legge (con l'OCR se è una scansione) e propone i valori;
 * l'utente li controlla e salva. Nulla resta sul telefono oltre alla copia sincronizzata.
 */

export type DraftValues = ReportDraftDTO['values'];

/** Documento scelto sul telefono (foto scattata, dalla galleria o PDF). */
export interface PickedDocument {
  uri: string;
  name: string;
  mimeType: 'image/jpeg' | 'application/pdf';
}

type Send = <T>(method: 'POST' | 'DELETE', path: string, payload?: { body?: unknown; form?: FormData; timeoutMs?: number }) => Promise<T>;

/** Una pagina scansionata può richiedere decine di secondi di OCR sul server. */
const OCR_TIMEOUT_MS = 150_000;
const UPLOAD_TIMEOUT_MS = 120_000;

export interface ReadDraft {
  fileId: string;
  values: DraftValues;
  warnings: string[];
  identity: ReportDraftDTO['identity'];
  parser: { id: string; version: number } | null;
  /** Righe dei valori lette con poca sicurezza dall'OCR (da controllare). */
  uncertainRows: number[];
  /** Il documento è stato letto con l'OCR. */
  scanned: boolean;
}

export async function uploadDocument(send: Send, patientId: string, doc: PickedDocument): Promise<MobileDraftResponseDTO> {
  const form = new FormData();
  // In React Native un file si allega indicandone il percorso: lo legge fetch.
  form.append('file', { uri: doc.uri, name: doc.name, type: doc.mimeType } as unknown as Blob);
  return send<MobileDraftResponseDTO>('POST', `/patients/${encodeURIComponent(patientId)}/drafts`, { form, timeoutMs: UPLOAD_TIMEOUT_MS });
}

/** Campi di testo della proposta: quelli vuoti si riempiono con quanto letto nelle pagine successive. */
const TEXT_KEYS = ['title', 'examDate', 'samplingDate', 'reportDate', 'reportNumber', 'facility', 'doctor', 'doctorRole', 'body'] as const;

/**
 * Legge con l'OCR tutte le pagine della scansione, una alla volta (`onPage` per mostrare l'avanzamento),
 * e unisce i risultati: i campi dalla prima pagina che li contiene, i valori di tutte le pagine in fila.
 */
export async function readScan(send: Send, draft: ReportDraftDTO & { file: NonNullable<ReportDraftDTO['file']>; scan: NonNullable<ReportDraftDTO['scan']> }, onPage: (page: number, total: number) => void): Promise<ReadDraft> {
  const total = draft.scan.pages.length;
  const values: DraftValues = { ...draft.values, results: [] };
  const warnings: string[] = [];
  const uncertainRows: number[] = [];
  let parser: ReadDraft['parser'] = null;
  for (let page = 1; page <= total; page++) {
    onPage(page, total);
    const read = await send<ScanReadDTO>('POST', `/files/${encodeURIComponent(draft.file.id)}/ocr`, {
      body: { page, mode: 'page' },
      timeoutMs: OCR_TIMEOUT_MS,
    });
    if (read.mode !== 'page') continue;
    parser = read.parser;
    if (page === 1) values.templateId = read.values.templateId || values.templateId;
    for (const key of TEXT_KEYS) if (!values[key] && read.values[key]) values[key] = read.values[key];
    uncertainRows.push(...read.uncertain.map((i) => i + values.results.length));
    values.results.push(...read.values.results);
    for (const w of read.warnings) if (!warnings.includes(w)) warnings.push(w);
  }
  return { fileId: draft.file.id, values, warnings, identity: null, parser, uncertainRows, scanned: true };
}

/** Proposta di un PDF con testo (o di una scansione senza OCR): così com'è. */
export const plainDraft = (draft: ReportDraftDTO & { file: NonNullable<ReportDraftDTO['file']> }): ReadDraft => ({
  fileId: draft.file.id,
  values: draft.values,
  warnings: draft.warnings,
  identity: draft.identity,
  parser: draft.parser,
  uncertainRows: [],
  scanned: false,
});

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** "1/6/2025" o "01.06.25" → "2025-06-01"; null se non è una data. */
export function parseDateInput(text: string): string | null {
  const m = /^\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})\s*$/.exec(text);
  if (!m) return null;
  const year = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const iso = `${year}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : iso;
}

/** Valore di un campo (standard o personalizzato) nel form. */
export function fieldValue(values: DraftValues, key: string): string {
  const raw = isStandardReportField(key) ? (values as unknown as Record<string, unknown>)[key] : values.custom[key];
  return typeof raw === 'string' ? raw : '';
}

export function withFieldValue(values: DraftValues, key: string, value: string): DraftValues {
  return isStandardReportField(key) ? { ...values, [key]: value } : { ...values, custom: { ...values.custom, [key]: value } };
}

/**
 * Controlli prima dell'invio (gli stessi li ripete il server): titolo, data dell'esame, date scritte bene,
 * campi obbligatori del tipo. Restituisce gli errori per campo ('' = nessuno).
 */
export function validateDraft(values: DraftValues, fields: readonly ReportField[]): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!values.title.trim()) errors.title = 'Il titolo è obbligatorio';
  if (!values.examDate) errors.examDate = 'Inserisci la data dell’esame';
  for (const key of ['examDate', ...fields.filter((f) => f.type === 'date').map((f) => f.key)]) {
    const v = fieldValue(values, key);
    if (v && !ISO_DATE.test(v)) errors[key] = 'Data non valida (GG/MM/AAAA)';
  }
  values.results.forEach((r, i) => {
    if (!r.name.trim()) errors[`results.${i}.name`] = 'Nome obbligatorio';
    if (!r.value.trim()) errors[`results.${i}.value`] = 'Valore obbligatorio';
  });
  for (const issue of checkReportFields(fields, values)) errors[issue.path.join('.')] ??= issue.message;
  return errors;
}

/**
 * Dati da inviare: solo i campi del tipo scelto (quelli non mostrati non si salvano di nascosto) e
 * i valori solo se il tipo ha la tabella.
 */
export function toReportInput(values: DraftValues, fields: readonly ReportField[]) {
  const shown = new Set(fields.map((f) => f.key));
  const input: DraftValues = { ...values, custom: {} };
  for (const key of STANDARD_REPORT_FIELD_KEYS) {
    if (shown.has(key)) continue;
    if (key === 'results') input.results = [];
    else input[key] = '';
  }
  for (const f of fields) if (!isStandardReportField(f.key)) input.custom[f.key] = values.custom[f.key] ?? '';
  return input;
}

export async function saveReport(send: Send, patientId: string, draft: ReadDraft, values: DraftValues, fields: readonly ReportField[]) {
  return send<ReportDTO>('POST', `/patients/${encodeURIComponent(patientId)}/reports`, {
    body: { input: toReportInput(values, fields), fileId: draft.fileId, parser: draft.parser },
  });
}

/** Annulla: elimina il documento caricato (se non è riuscito resterà in revisione sul server, senza danni). */
export function discardDocument(send: Send, fileId: string) {
  return send<void>('DELETE', `/files/${encodeURIComponent(fileId)}`).catch(() => {});
}

export const errorMessage = (err: unknown) =>
  err instanceof ApiError
    ? err.offline
      ? 'Serve la connessione: i nuovi referti si inseriscono solo online.'
      : err.message
    : 'Operazione non riuscita.';
