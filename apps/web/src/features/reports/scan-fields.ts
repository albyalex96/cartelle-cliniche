import type { ScanReadMode } from '@alby/shared';

/** Campi standard che la lettura automatica (PDF con testo o pagina intera della scansione) compila se vuoti. */
export const SCAN_FIELDS = {
  title: { label: 'Titolo', mode: 'line' },
  examDate: { label: 'Data dell’esame', mode: 'date' },
  samplingDate: { label: 'Data del prelievo', mode: 'date' },
  reportDate: { label: 'Data del referto', mode: 'date' },
  facility: { label: 'Struttura', mode: 'line' },
  reportNumber: { label: 'Numero del referto', mode: 'line' },
  doctor: { label: 'Medico', mode: 'line' },
  doctorRole: { label: 'Qualifica', mode: 'line' },
  body: { label: 'Testo del referto', mode: 'paragraph' },
} as const satisfies Record<string, { label: string; mode: Exclude<ScanReadMode, 'table' | 'page'> }>;

export type ScanField = keyof typeof SCAN_FIELDS;

/** Come si legge il testo per un campo: data, riga singola o testo lungo. */
export type ScanFieldMode = Exclude<ScanReadMode, 'table' | 'page'>;

/**
 * Cosa fare della zona selezionata sul documento: leggerne il testo (OCR) per la tabella dei valori,
 * per un campo del form (`field` è la chiave del campo nel tipo di referto) o per tutta la pagina,
 * oppure ritagliarla come immagine (`crop`).
 */
export type ScanTarget =
  | { kind: 'table' }
  | { kind: 'field'; field: string; label: string; mode: ScanFieldMode }
  | { kind: 'page' }
  | { kind: 'crop' };

export const targetLabel = (t: ScanTarget) => (t.kind === 'table' ? 'Valori' : t.kind === 'page' ? 'Tutta la pagina' : t.kind === 'crop' ? 'Immagine' : t.label);

export const sameTarget = (a: ScanTarget | null, b: ScanTarget) => !!a && a.kind === b.kind && (a.kind !== 'field' || (b.kind === 'field' && a.field === b.field));
