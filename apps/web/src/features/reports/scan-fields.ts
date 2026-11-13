import type { ScanReadMode } from '@alby/shared';

/** Campi del form che si possono compilare selezionando una zona della scansione. */
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

export const isScanField = (name: string | null | undefined): name is ScanField => !!name && Object.hasOwn(SCAN_FIELDS, name);

/** Dove finisce il testo letto: tabella dei valori, un campo del form, oppure tutta la pagina. */
export type ScanTarget = { kind: 'table' } | { kind: 'field'; field: ScanField } | { kind: 'page' };

export const targetLabel = (t: ScanTarget) => (t.kind === 'table' ? 'Valori' : t.kind === 'page' ? 'Tutta la pagina' : SCAN_FIELDS[t.field].label);

export const sameTarget = (a: ScanTarget | null, b: ScanTarget) => !!a && a.kind === b.kind && (a.kind !== 'field' || (b.kind === 'field' && a.field === b.field));
