/**
 * Catalogo degli esami di laboratorio più comuni, con i nomi alternativi usati dai vari laboratori:
 * serve a riconoscere che "Emoglobina", "HGB" e "Hb" sono lo stesso esame, per seguirne l'andamento.
 * Gli esami che non sono nel catalogo vengono comunque raggruppati per nome (scritto allo stesso modo).
 * Codice puro: usato dal server e, se serve, dal browser.
 */

export const ANALYTE_CATEGORIES = [
  'Emocromo',
  'Glicemia e diabete',
  'Rene',
  'Fegato e pancreas',
  'Grassi nel sangue',
  'Sali minerali',
  'Ferro e vitamine',
  'Infiammazione',
  'Coagulazione',
  'Tiroide e ormoni',
  'Urine',
  'Altri esami',
] as const;
export type AnalyteCategory = (typeof ANALYTE_CATEGORIES)[number];

interface AnalyteDef {
  key: string;
  label: string;
  category: AnalyteCategory;
  /** Nomi alternativi (scritti come capita: la normalizzazione la fa `normalizeAnalyteName`). */
  aliases: string[];
}

const A = (key: string, label: string, category: AnalyteCategory, aliases: string[] = []): AnalyteDef => ({ key, label, category, aliases });

const CATALOG: AnalyteDef[] = [
  // Emocromo
  A('globuli-rossi', 'Globuli rossi', 'Emocromo', ['RBC', 'Eritrociti', 'Emazie', 'Conta eritrociti', 'GR']),
  A('emoglobina', 'Emoglobina', 'Emocromo', ['HGB', 'Hb', 'Emoglobina totale']),
  A('ematocrito', 'Ematocrito', 'Emocromo', ['HCT', 'Ht']),
  A('mcv', 'Volume medio dei globuli rossi (MCV)', 'Emocromo', ['MCV', 'Volume corpuscolare medio', 'Volume globulare medio']),
  A('mch', 'Emoglobina media (MCH)', 'Emocromo', ['MCH', 'Contenuto medio di emoglobina', 'Emoglobina corpuscolare media']),
  A('mchc', 'Concentrazione media di emoglobina (MCHC)', 'Emocromo', ['MCHC', 'Concentrazione emoglobinica corpuscolare media']),
  A('rdw', 'Variabilità dei globuli rossi (RDW)', 'Emocromo', ['RDW', 'RDW-CV', 'RDW CV', 'Ampiezza distribuzione eritrocitaria']),
  A('globuli-bianchi', 'Globuli bianchi', 'Emocromo', ['WBC', 'Leucociti', 'GB', 'Conta leucocitaria']),
  A('neutrofili', 'Neutrofili', 'Emocromo', ['NEU', 'NEUT', 'Granulociti neutrofili', 'Neutrofili segmentati']),
  A('linfociti', 'Linfociti', 'Emocromo', ['LYM', 'LYMPH', 'LINF']),
  A('monociti', 'Monociti', 'Emocromo', ['MONO', 'MON']),
  A('eosinofili', 'Eosinofili', 'Emocromo', ['EOS', 'Granulociti eosinofili']),
  A('basofili', 'Basofili', 'Emocromo', ['BASO', 'BAS', 'Granulociti basofili']),
  A('piastrine', 'Piastrine', 'Emocromo', ['PLT', 'Trombociti', 'Conta piastrinica']),
  A('mpv', 'Volume medio delle piastrine (MPV)', 'Emocromo', ['MPV', 'Volume piastrinico medio']),
  // Glicemia
  A('glucosio', 'Glicemia', 'Glicemia e diabete', ['Glucosio', 'Glicemia a digiuno', 'Glucosio a digiuno', 'GLU']),
  A('emoglobina-glicata', 'Emoglobina glicata (HbA1c)', 'Glicemia e diabete', ['HbA1c', 'Emoglobina glicosilata', 'Hb glicata', 'Emoglobina A1c']),
  // Rene
  A('creatinina', 'Creatinina', 'Rene', ['Creatininemia', 'CREA']),
  A('egfr', 'Filtrato glomerulare stimato (eGFR)', 'Rene', ['eGFR', 'VFG', 'GFR', 'Filtrato glomerulare', 'eGFR CKD-EPI', 'Velocità di filtrazione glomerulare']),
  A('urea', 'Azotemia (urea)', 'Rene', ['Azotemia', 'Urea', 'BUN']),
  A('acido-urico', 'Acido urico', 'Rene', ['Uricemia', 'Urato']),
  // Fegato e pancreas
  A('ast', 'AST (GOT)', 'Fegato e pancreas', ['AST', 'GOT', 'AST/GOT', 'GOT/AST', 'Aspartato aminotransferasi', 'Transaminasi GOT', 'SGOT']),
  A('alt', 'ALT (GPT)', 'Fegato e pancreas', ['ALT', 'GPT', 'ALT/GPT', 'GPT/ALT', 'Alanina aminotransferasi', 'Transaminasi GPT', 'SGPT']),
  A('ggt', 'Gamma GT', 'Fegato e pancreas', ['GGT', 'Gamma-GT', 'γ-GT', 'Gamma glutamil transferasi', 'Gamma glutamiltransferasi', 'Gamma glutamiltranspeptidasi']),
  A('fosfatasi-alcalina', 'Fosfatasi alcalina', 'Fegato e pancreas', ['ALP', 'FA', 'Fosfatasi alcalina totale']),
  A('bilirubina-totale', 'Bilirubina totale', 'Fegato e pancreas', ['Bilirubina', 'BIL-T', 'Bilirubinemia totale']),
  A('bilirubina-diretta', 'Bilirubina diretta', 'Fegato e pancreas', ['BIL-D', 'Bilirubina coniugata']),
  A('bilirubina-indiretta', 'Bilirubina indiretta', 'Fegato e pancreas', ['Bilirubina non coniugata']),
  A('proteine-totali', 'Proteine totali', 'Fegato e pancreas', ['Protidemia', 'Protidemia totale']),
  A('albumina', 'Albumina', 'Fegato e pancreas', ['Albuminemia', 'ALB']),
  A('amilasi', 'Amilasi', 'Fegato e pancreas', ['Amilasemia', 'Amilasi totale', 'Amilasi pancreatica']),
  A('lipasi', 'Lipasi', 'Fegato e pancreas', ['Lipasemia']),
  A('ldh', 'LDH', 'Fegato e pancreas', ['Lattato deidrogenasi', 'Latticodeidrogenasi', 'LD']),
  A('cpk', 'CPK', 'Altri esami', ['CK', 'Creatinchinasi', 'Creatina chinasi', 'Creatinfosfochinasi']),
  // Grassi
  A('colesterolo-totale', 'Colesterolo totale', 'Grassi nel sangue', ['Colesterolo', 'Colesterolemia', 'CHOL', 'Colesterolo tot']),
  A('colesterolo-hdl', 'Colesterolo HDL', 'Grassi nel sangue', ['HDL', 'HDL colesterolo', 'Colesterolo HDL diretto']),
  A('colesterolo-ldl', 'Colesterolo LDL', 'Grassi nel sangue', ['LDL', 'LDL colesterolo', 'Colesterolo LDL calcolato', 'Colesterolo LDL diretto']),
  A('trigliceridi', 'Trigliceridi', 'Grassi nel sangue', ['Trigliceridemia', 'TRIG', 'TG']),
  // Sali minerali
  A('sodio', 'Sodio', 'Sali minerali', ['Na', 'Sodiemia', 'Natremia']),
  A('potassio', 'Potassio', 'Sali minerali', ['K', 'Potassiemia', 'Kaliemia']),
  A('cloro', 'Cloro', 'Sali minerali', ['Cl', 'Cloremia', 'Cloruri']),
  A('calcio', 'Calcio', 'Sali minerali', ['Ca', 'Calcemia', 'Calcio totale']),
  A('magnesio', 'Magnesio', 'Sali minerali', ['Mg', 'Magnesiemia']),
  A('fosforo', 'Fosforo', 'Sali minerali', ['Fosforemia', 'Fosfato', 'Fosfatemia']),
  // Ferro e vitamine
  A('ferro', 'Ferro', 'Ferro e vitamine', ['Sideremia', 'Fe', 'Ferro sierico']),
  A('ferritina', 'Ferritina', 'Ferro e vitamine', ['Ferritinemia']),
  A('transferrina', 'Transferrina', 'Ferro e vitamine', ['Transferrinemia']),
  A('saturazione-transferrina', 'Saturazione della transferrina', 'Ferro e vitamine', ['Saturazione transferrina', 'Indice di saturazione della transferrina']),
  A('vitamina-d', 'Vitamina D', 'Ferro e vitamine', ['25-OH vitamina D', '25 OH vitamina D', '25-idrossi vitamina D', 'Vitamina D 25 OH', '25(OH)D', 'Vitamina D3', 'Colecalciferolo']),
  A('vitamina-b12', 'Vitamina B12', 'Ferro e vitamine', ['B12', 'Cobalamina', 'Cianocobalamina']),
  A('acido-folico', 'Acido folico', 'Ferro e vitamine', ['Folati', 'Folato', 'Folati sierici']),
  // Infiammazione
  A('pcr', 'Proteina C reattiva (PCR)', 'Infiammazione', ['PCR', 'CRP', 'Proteina C reattiva', 'PCR ultrasensibile', 'hs-CRP']),
  A('ves', 'VES', 'Infiammazione', ['Velocità di eritrosedimentazione', 'Eritrosedimentazione']),
  // Coagulazione
  A('inr', 'INR', 'Coagulazione', ['PT INR', 'Tempo di protrombina INR', 'PT-INR']),
  A('pt', 'Tempo di protrombina (PT)', 'Coagulazione', ['PT', 'Tempo di Quick', 'PT ratio']),
  A('aptt', 'aPTT', 'Coagulazione', ['PTT', 'Tempo di tromboplastina parziale attivata', 'aPTT ratio']),
  A('fibrinogeno', 'Fibrinogeno', 'Coagulazione', ['Fibrinogenemia']),
  A('d-dimero', 'D-dimero', 'Coagulazione', ['D-dimeri', 'D dimero', 'DDimero']),
  // Tiroide e ormoni
  A('tsh', 'TSH', 'Tiroide e ormoni', ['Tireotropina', 'TSH reflex', 'Ormone tireostimolante']),
  A('ft4', 'FT4', 'Tiroide e ormoni', ['Tiroxina libera', 'T4 libera', 'fT4']),
  A('ft3', 'FT3', 'Tiroide e ormoni', ['Triiodotironina libera', 'T3 libera', 'fT3']),
  A('psa', 'PSA totale', 'Tiroide e ormoni', ['PSA', 'Antigene prostatico specifico', 'PSA tot']),
];

const BY_KEY = new Map(CATALOG.map((a) => [a.key, a]));

/** Parole che non cambiano l'esame: il materiale e i prefissi tipo "S-" (siero), "P-" (plasma), "B-" (sangue). */
const FILLER = new Set(['s', 'p', 'b', 'sg', 'sangue', 'siero', 'sierico', 'plasma', 'plasmatico', 'su', 'di', 'del', 'della', 'nel', 'valore']);

/** Minuscolo, senza accenti, punteggiatura e parole inutili: "S-Emoglobina (HGB)" → "emoglobina hgb". */
export function normalizeAnalyteName(name: string): string {
  return name
    .replace(/γ/g, 'gamma')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((w) => w && !FILLER.has(w))
    .join(' ');
}

const ALIASES = new Map<string, string>();
for (const a of CATALOG) {
  for (const n of [a.label, a.key, ...a.aliases]) {
    const norm = normalizeAnalyteName(n);
    if (norm && !ALIASES.has(norm)) ALIASES.set(norm, a.key);
  }
}

const isUrineSection = (section?: string | null) => !!section && /urin/i.test(section);

export interface AnalyteMatch {
  /** Identificativo stabile (usato anche nell'indirizzo della pagina). */
  key: string;
  label: string;
  category: AnalyteCategory;
  /** Riconosciuto dal catalogo (altrimenti raggruppato solo per nome). */
  known: boolean;
}

/**
 * Riconosce un esame dal nome scritto nel referto. Conta anche la sezione: gli esami delle urine
 * restano separati da quelli del sangue ("Leucociti" nelle urine non sono i "Globuli bianchi").
 */
export function matchAnalyte(name: string, section?: string | null): AnalyteMatch {
  const norm = normalizeAnalyteName(name);
  const urine = isUrineSection(section) || /\burine\b/.test(norm);
  // "Emoglobina (HGB)" → prova anche "emoglobina" e "hgb"; "Neutrofili %" → "neutrofili".
  const outer = normalizeAnalyteName(name.replace(/\([^)]*\)/g, ' '));
  const inner = [...name.matchAll(/\(([^)]*)\)/g)].map((m) => normalizeAnalyteName(m[1]!));
  if (!urine) {
    for (const c of [norm, outer, ...inner]) {
      const key = c ? ALIASES.get(c) : undefined;
      if (key) {
        const a = BY_KEY.get(key)!;
        return { key: a.key, label: a.label, category: a.category, known: true };
      }
    }
  }
  const base = (outer || norm || 'esame').replace(/ /g, '-').slice(0, 80);
  const key = urine ? `urine-${base.replace(/^urine-?/, '') || 'esame'}` : base;
  return { key, label: name.trim(), category: urine ? 'Urine' : 'Altri esami', known: false };
}

/** Unità confrontabili: "mg/dl" e "mg/dL" sono la stessa unità, come "10^3/µL" e "10^3/uL". */
export function normalizeUnit(unit?: string | null): string {
  return (unit ?? '')
    .normalize('NFKC')
    .replace(/[µμ]/g, 'u')
    .replace(/\s+/g, '')
    .toLowerCase();
}

/** Posizione della categoria nell'elenco (per ordinare gli esami come in un referto). */
export const analyteCategoryRank = (c: AnalyteCategory) => ANALYTE_CATEGORIES.indexOf(c);
