/**
 * Template dei referti: ogni tipo di referto è un elenco di campi, deciso dagli amministratori.
 * Ogni campo ha la forma `{ key, type, label, required, ocr_enabled, hint, options }`.
 *
 * Titolo, data dell'esame, immagini e note personali ci sono sempre e non fanno parte del template.
 * I campi "standard" (struttura, medico, tabella dei valori…) sono quelli che l'applicazione conosce:
 * hanno una colonna propria nel database e vengono compilati dalla lettura automatica dei PDF.
 * Tutti gli altri sono campi personalizzati, salvati insieme al referto.
 */
import { z } from 'zod';
import { parseItalianNumber } from './lab';

export const REPORT_FIELD_TYPES = ['text_input', 'textarea', 'rich_text', 'date', 'number', 'select', 'checkbox', 'lab_table'] as const;
export type ReportFieldType = (typeof REPORT_FIELD_TYPES)[number];

export const REPORT_FIELD_TYPE_LABELS: Record<ReportFieldType, string> = {
  text_input: 'Testo breve',
  textarea: 'Testo lungo',
  rich_text: 'Testo formattato',
  date: 'Data',
  number: 'Numero',
  select: 'Scelta da un elenco',
  checkbox: 'Casella sì/no',
  lab_table: 'Tabella dei valori',
};

/** Tipi che nel form occupano un riquadro a sé, sotto i campi brevi. */
const BLOCK_TYPES: readonly ReportFieldType[] = ['textarea', 'rich_text', 'lab_table'];
export const isBlockReportField = (f: Pick<ReportField, 'type'>) => BLOCK_TYPES.includes(f.type);

/** Come leggere il campo da una zona della scansione (OCR); `null` se il tipo non si può leggere. */
export function reportFieldOcrMode(type: ReportFieldType): 'table' | 'date' | 'line' | 'paragraph' | null {
  if (type === 'lab_table') return 'table';
  if (type === 'date') return 'date';
  if (type === 'text_input' || type === 'number') return 'line';
  if (type === 'textarea' || type === 'rich_text') return 'paragraph';
  return null;
}

/** Campi standard: chiave → tipo (fisso) ed etichetta proposta. */
export const STANDARD_REPORT_FIELDS = {
  facility: { type: 'text_input', label: 'Struttura', hint: 'Ospedale, laboratorio o studio.' },
  reportNumber: { type: 'text_input', label: 'Numero del referto', hint: '' },
  doctor: { type: 'text_input', label: 'Medico', hint: '' },
  doctorRole: { type: 'text_input', label: 'Qualifica', hint: '' },
  samplingDate: { type: 'date', label: 'Data del prelievo', hint: 'Il giorno in cui è stato fatto il prelievo, se indicato.' },
  reportDate: { type: 'date', label: 'Data del referto', hint: '' },
  results: { type: 'lab_table', label: 'Valori', hint: '' },
  body: { type: 'rich_text', label: 'Testo del referto', hint: '' },
} as const satisfies Record<string, { type: ReportFieldType; label: string; hint: string }>;

export type StandardReportFieldKey = keyof typeof STANDARD_REPORT_FIELDS;
export const STANDARD_REPORT_FIELD_KEYS = Object.keys(STANDARD_REPORT_FIELDS) as StandardReportFieldKey[];

export const isStandardReportField = (key: string): key is StandardReportFieldKey => Object.hasOwn(STANDARD_REPORT_FIELDS, key);

/** Chiavi che un campo personalizzato non può usare (campi sempre presenti o nomi interni). */
const RESERVED_KEYS = ['title', 'examDate', 'notes', 'templateId', 'custom'];

export const reportFieldSchema = z.object({
  /** Identificativo del campo dentro il template: non cambia più, anche se cambia l'etichetta. */
  key: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,39}$/, 'Chiave non valida'),
  type: z.enum(REPORT_FIELD_TYPES, 'Scegli il tipo di campo'),
  label: z.string().trim().min(1, 'L’etichetta è obbligatoria').max(100, 'Massimo 100 caratteri'),
  required: z.boolean().default(false),
  /** Il campo si può compilare selezionando una zona della scansione. */
  ocr_enabled: z.boolean().default(false),
  /** Spiegazione mostrata sotto il campo. */
  hint: z.string().trim().max(300, 'Massimo 300 caratteri').default(''),
  /** Voci tra cui scegliere (solo per `select`). */
  options: z.array(z.string().trim().min(1).max(100)).max(50, 'Massimo 50 voci').default([]),
  /** Categoria del campo (chiave di una categoria del tipo), '' = nessuna. */
  category: z.string().max(40).default(''),
});
export type ReportField = z.output<typeof reportFieldSchema>;
export type ReportFieldInput = z.input<typeof reportFieldSchema>;

/** Categoria di un tipo di referto: nella pagina del referto i suoi campi stanno insieme, in una card. */
export const reportCategorySchema = z.object({
  key: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,39}$/, 'Chiave non valida'),
  name: z.string().trim().min(1, 'Il nome è obbligatorio').max(100, 'Massimo 100 caratteri'),
  description: z.string().trim().max(300, 'Massimo 300 caratteri').default(''),
});
export type ReportCategory = z.output<typeof reportCategorySchema>;

/**
 * Icone tra cui scegliere per un tipo di referto (nomi delle icone Lucide), con la descrizione da mostrare.
 * L'elenco è chiuso: l'app web e l'app mobile sanno disegnarle tutte.
 */
export const REPORT_TEMPLATE_ICONS = {
  'file-text': 'Documento',
  'flask-conical': 'Analisi',
  'test-tube': 'Provetta',
  droplet: 'Sangue',
  microscope: 'Microscopio',
  dna: 'Genetica',
  'heart-pulse': 'Cuore',
  activity: 'Tracciato',
  stethoscope: 'Visita',
  brain: 'Cervello',
  bone: 'Ossa',
  eye: 'Occhi',
  ear: 'Orecchie',
  wind: 'Respiro',
  scan: 'Immagini',
  radiation: 'Radiologia',
  pill: 'Farmaci',
  syringe: 'Vaccino o iniezione',
  bandage: 'Medicazione',
  thermometer: 'Febbre',
  baby: 'Bambino',
  venus: 'Ginecologia',
  mars: 'Andrologia',
  apple: 'Alimentazione',
  accessibility: 'Riabilitazione',
  hospital: 'Ricovero',
  ambulance: 'Pronto soccorso',
  'clipboard-list': 'Certificato',
} as const satisfies Record<string, string>;
export type ReportTemplateIcon = keyof typeof REPORT_TEMPLATE_ICONS;
export const REPORT_TEMPLATE_ICON_KEYS = Object.keys(REPORT_TEMPLATE_ICONS) as [ReportTemplateIcon, ...ReportTemplateIcon[]];

/** Icona proposta quando non è stata scelta: la provetta per le analisi, il documento per il resto. */
export const defaultReportTemplateIcon = (fields: readonly Pick<ReportField, 'type'>[]): ReportTemplateIcon =>
  hasLabTable(fields) ? 'flask-conical' : 'file-text';

/** Icona letta dal database: un valore sconosciuto diventa quella predefinita per i campi. */
export const parseReportTemplateIcon = (raw: unknown, fields: readonly Pick<ReportField, 'type'>[]): ReportTemplateIcon =>
  typeof raw === 'string' && Object.hasOwn(REPORT_TEMPLATE_ICONS, raw) ? (raw as ReportTemplateIcon) : defaultReportTemplateIcon(fields);

export const reportTemplateInputSchema = z
  .object({
    name: z.string().trim().min(1, 'Il nome è obbligatorio').max(100, 'Massimo 100 caratteri'),
    /** Icona mostrata accanto al nome (nel menu "+", nell'elenco dei referti…). */
    icon: z.enum(REPORT_TEMPLATE_ICON_KEYS, 'Scegli un’icona').default('file-text'),
    /** Spiegazione breve, mostrata quando si sceglie il tipo. */
    description: z.string().trim().max(200, 'Massimo 200 caratteri').default(''),
    fields: z.array(reportFieldSchema).max(60, 'Troppi campi (massimo 60)'),
    categories: z.array(reportCategorySchema).max(30, 'Troppe categorie (massimo 30)').default([]),
  })
  .superRefine((template, ctx) => {
    const categoryKeys = new Set<string>();
    const categoryNames = new Set<string>();
    template.categories.forEach((c, i) => {
      const issue = (field: string, message: string) => ctx.addIssue({ code: 'custom', path: ['categories', i, field], message });
      if (categoryKeys.has(c.key)) issue('key', 'Categoria ripetuta');
      if (categoryNames.has(c.name.toLocaleLowerCase('it'))) issue('name', 'C’è già una categoria con questo nome');
      categoryKeys.add(c.key);
      categoryNames.add(c.name.toLocaleLowerCase('it'));
    });
    const seen = new Set<string>();
    template.fields.forEach((f, i) => {
      const issue = (field: string, message: string) => ctx.addIssue({ code: 'custom', path: ['fields', i, field], message });
      if (seen.has(f.key)) issue('key', 'Campo ripetuto');
      seen.add(f.key);
      if (isStandardReportField(f.key)) {
        if (STANDARD_REPORT_FIELDS[f.key].type !== f.type) issue('type', 'Il tipo di un campo standard non si può cambiare');
      } else if (RESERVED_KEYS.includes(f.key)) issue('key', 'Chiave riservata');
      else if (f.type === 'lab_table') issue('type', 'La tabella dei valori è un campo standard: aggiungila dall’elenco');
      if (f.type === 'select' && f.options.length === 0) issue('options', 'Scrivi almeno una voce');
      if (f.type === 'select' && new Set(f.options).size !== f.options.length) issue('options', 'Ci sono voci ripetute');
      if (f.category && !categoryKeys.has(f.category)) issue('category', 'Categoria inesistente');
    });
  })
  .transform((template) => ({
    ...template,
    // Si tiene solo ciò che ha senso per il tipo del campo.
    fields: template.fields.map((f) => ({
      ...f,
      ocr_enabled: f.ocr_enabled && reportFieldOcrMode(f.type) !== null,
      options: f.type === 'select' ? f.options : [],
    })),
  }));
export type ReportTemplateInput = z.input<typeof reportTemplateInputSchema>;
export type ReportTemplateData = z.output<typeof reportTemplateInputSchema>;

/** Un tipo di referto, con i suoi campi. */
export interface ReportTemplateDTO {
  id: string;
  name: string;
  description: string;
  icon: ReportTemplateIcon;
  fields: ReportField[];
  categories: ReportCategory[];
}

/** Campi letti dal database: ciò che non è un elenco di campi valido diventa un elenco vuoto. */
export function parseReportFields(raw: unknown): ReportField[] {
  const parsed = z.array(reportFieldSchema).safeParse(raw);
  return parsed.success ? parsed.data : [];
}

/** Categorie lette dal database: ciò che non è un elenco valido diventa un elenco vuoto. */
export function parseReportCategories(raw: unknown): ReportCategory[] {
  const parsed = z.array(reportCategorySchema).safeParse(raw);
  return parsed.success ? parsed.data : [];
}

/** Le categorie usate da questi campi, prese (nell'ordine) dagli elenchi indicati; senza doppioni. */
export function usedReportCategories(fields: readonly Pick<ReportField, 'category'>[], ...lists: readonly ReportCategory[][]): ReportCategory[] {
  const used = new Set(fields.map((f) => f.category).filter(Boolean));
  const out = new Map<string, ReportCategory>();
  for (const c of lists.flat()) if (used.has(c.key) && !out.has(c.key)) out.set(c.key, c);
  return [...out.values()];
}

export const hasLabTable = (fields: readonly Pick<ReportField, 'type'>[]) => fields.some((f) => f.type === 'lab_table');

/**
 * Il tipo da proporre per un documento letto in automatico: il primo con la tabella dei valori per le
 * analisi, il primo senza per tutto il resto (se non ce n'è uno adatto, il primo dell'elenco).
 */
export function pickReportTemplate<T extends { fields: ReportField[] }>(templates: readonly T[], lab: boolean): T | undefined {
  return templates.find((t) => hasLabTable(t.fields) === lab) ?? templates[0];
}

/**
 * Campi data di un tipo di referto, tra cui scegliere quello con la scadenza del piano terapeutico:
 * la data dell'esame (sempre presente) e i campi di tipo data del tipo.
 */
export const reportDateFields = (fields: readonly Pick<ReportField, 'key' | 'type' | 'label'>[]): { key: string; label: string }[] => [
  { key: 'examDate', label: 'Data dell’esame' },
  ...fields.filter((f) => f.type === 'date').map((f) => ({ key: f.key, label: f.label })),
];

/** Valori di un referto (form o referto salvato): i campi standard per nome, quelli personalizzati in `custom`. */
export interface ReportFieldValues {
  custom?: Record<string, string | null | undefined> | null;
  results?: readonly unknown[] | null;
}

/** I campi standard come campi di un template (per mostrare quelli che hanno un valore anche se il tipo non li prevede). */
export const standardReportFieldDefs = (): ReportField[] =>
  STANDARD_REPORT_FIELD_KEYS.map((key) => ({ key, ...STANDARD_REPORT_FIELDS[key], required: false, ocr_enabled: true, options: [], category: '' }));

/** Valore di un campo come testo ('' se vuoto). Per la tabella dei valori: il numero di righe. */
export function reportFieldValue(field: Pick<ReportField, 'key' | 'type'>, values: ReportFieldValues): string {
  if (field.type === 'lab_table') return values.results?.length ? String(values.results.length) : '';
  const raw = isStandardReportField(field.key) ? (values as Record<string, unknown>)[field.key] : values.custom?.[field.key];
  return typeof raw === 'string' ? raw : '';
}

/**
 * Campi con cui compilare e salvare un referto: quelli del template di oggi e, in fondo, quelli con cui
 * il referto era stato salvato che nel template non ci sono più ma hanno ancora un valore
 * (così modificare un referto dopo che il template è cambiato non fa perdere nulla).
 */
export function effectiveReportFields(template: readonly ReportField[], previous: readonly ReportField[], values: ReportFieldValues): ReportField[] {
  const keys = new Set(template.map((f) => f.key));
  const kept: ReportField[] = [];
  for (const f of previous) {
    if (keys.has(f.key) || reportFieldValue(f, values) === '') continue;
    keys.add(f.key);
    kept.push({ ...f, required: false });
  }
  return [...template, ...kept];
}

const CUSTOM_MAX: Partial<Record<ReportFieldType, number>> = { text_input: 300, number: 50, textarea: 5000, rich_text: 50_000 };

/** Controlli che dipendono dal template: campi obbligatori e forma dei valori dei campi personalizzati. */
export function checkReportFields(fields: readonly ReportField[], values: ReportFieldValues): { path: (string | number)[]; message: string }[] {
  const issues: { path: (string | number)[]; message: string }[] = [];
  for (const f of fields) {
    const standard = isStandardReportField(f.key);
    const path = standard ? [f.key] : ['custom', f.key];
    const value = reportFieldValue(f, values).trim();
    if (!value) {
      if (f.required) issues.push({ path, message: f.type === 'lab_table' ? 'Aggiungi almeno un valore' : f.type === 'checkbox' ? 'Va spuntata' : 'Campo obbligatorio' });
      continue;
    }
    // La forma dei campi standard la controlla già lo schema del referto.
    if (standard) continue;
    const max = CUSTOM_MAX[f.type];
    if (max && value.length > max) issues.push({ path, message: `Massimo ${max} caratteri` });
    else if (f.type === 'date' && !z.iso.date().safeParse(value).success) issues.push({ path, message: 'Data non valida' });
    else if (f.type === 'number' && parseItalianNumber(value) === undefined) issues.push({ path, message: 'Inserisci un numero' });
    else if (f.type === 'select' && !f.options.includes(value)) issues.push({ path, message: 'Scegli una voce dell’elenco' });
  }
  return issues;
}
