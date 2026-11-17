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
 * Nuovo referto dall'app: si compila a mano o leggendo i campi da una foto (sul telefono, `device-ocr`;
 * le foto della lettura non si salvano). PDF e immagini del referto si allegano a parte e vanno sul server
 * solo al salvataggio; per salvare serve la connessione.
 */

export type DraftValues = ReportDraftDTO['values'];

/** Documento scelto sul telefono (il PDF del referto). */
export interface PickedDocument {
  uri: string;
  name: string;
  mimeType: 'image/jpeg' | 'application/pdf';
}

type Send = <T>(method: 'POST' | 'DELETE', path: string, payload?: { body?: unknown; form?: FormData; timeoutMs?: number }) => Promise<T>;

const UPLOAD_TIMEOUT_MS = 120_000;

export async function uploadDocument(send: Send, patientId: string, doc: PickedDocument): Promise<MobileDraftResponseDTO> {
  const form = new FormData();
  // In React Native un file si allega indicandone il percorso: lo legge fetch.
  form.append('file', { uri: doc.uri, name: doc.name, type: doc.mimeType } as unknown as Blob);
  return send<MobileDraftResponseDTO>('POST', `/patients/${encodeURIComponent(patientId)}/drafts`, { form, timeoutMs: UPLOAD_TIMEOUT_MS });
}

/** Form vuoto, con il tipo di referto indicato. */
export const emptyValues = (templateId: string): DraftValues => ({
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

/** Campi che stanno nel form con il loro nome: quelli sempre presenti (titolo, data, note) e quelli standard. */
const isOwnKey = (key: string) => key === 'title' || key === 'examDate' || key === 'notes' || isStandardReportField(key);

/** Valore di un campo (standard o personalizzato) nel form. */
export function fieldValue(values: DraftValues, key: string): string {
  const raw = isOwnKey(key) ? (values as unknown as Record<string, unknown>)[key] : values.custom[key];
  return typeof raw === 'string' ? raw : '';
}

export function withFieldValue(values: DraftValues, key: string, value: string): DraftValues {
  return isOwnKey(key) ? { ...values, [key]: value } : { ...values, custom: { ...values.custom, [key]: value } };
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

/** Immagine del referto: diventa uno studio di immagini del paziente, da collegare al referto. */
export async function uploadImage(send: Send, patientId: string, image: { uri: string; name: string; mimeType: string }, studyDate: string) {
  const form = new FormData();
  form.append('file', { uri: image.uri, name: image.name, type: image.mimeType } as unknown as Blob);
  if (studyDate) form.append('studyDate', studyDate);
  const res = await send<{ studyId: string }>('POST', `/patients/${encodeURIComponent(patientId)}/images`, { form, timeoutMs: UPLOAD_TIMEOUT_MS });
  return res.studyId;
}

/** `fileId`: il PDF del referto (già inviato); `parser`: se dei campi sono stati letti dal PDF; `studyIds`: le immagini. */
export async function saveReport(
  send: Send,
  patientId: string,
  values: DraftValues,
  fields: readonly ReportField[],
  attachments: { fileId: string | null; parser: { id: string; version: number } | null; studyIds: string[] },
) {
  return send<ReportDTO>('POST', `/patients/${encodeURIComponent(patientId)}/reports`, {
    body: { input: toReportInput(values, fields), fileId: attachments.fileId, parser: attachments.parser, studyIds: attachments.studyIds },
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
