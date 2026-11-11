import { isOutOfRange, parseItalianNumber } from '@alby/shared';
import type { LayoutCell, LayoutLine } from './layout';

/**
 * Estrattore GENERICO: non conosce il formato di nessuna struttura sanitaria in particolare.
 * Come l'anonimizzatore, si basa su ciò che quasi tutti i referti hanno in comune:
 *  - campi anagrafici e dati del referto introdotti da etichette ("Data esame:", "N. referto"…);
 *  - per le analisi, una tabella con intestazione "Esame | Risultato | Unità | Riferimento";
 *  - per i referti descrittivi (RM, TAC, ecografie, visite): titolo dell'esame + testo + firma.
 * Il risultato è una PROPOSTA: va sempre rivisto dall'utente prima del salvataggio.
 */

export const GENERIC_PARSER = { id: 'generico', versione: 1 } as const;

export interface LabResult {
  /** Sezione della tabella in cui compare (es. "EMOCROMO"), se presente. */
  sezione?: string;
  nome: string;
  /** Valore così come scritto nel referto (es. "13,8", "< 0,5", "Negativo"). */
  valore: string;
  /** Valore numerico, se il risultato è un numero. */
  numero?: number;
  unita?: string;
  riferimento?: string;
  /** Segnalato fuori dai valori di riferimento (dal simbolo nel referto o confrontando con l'intervallo). */
  fuoriRange?: boolean;
}

export interface ExtractedReport {
  parser: { id: string; versione: number };
  tipo: 'laboratorio' | 'descrittivo';
  /** Dati anagrafici letti dal referto: servono a CONTROLLARE che sia del paziente giusto, non a sovrascriverlo. */
  paziente: { nomeCompleto?: string; dataNascita?: string; codiceFiscale?: string; sesso?: 'M' | 'F' };
  /** Date in formato ISO (AAAA-MM-GG). */
  dataEsame?: string;
  dataReferto?: string;
  numeroReferto?: string;
  medico?: string;
  qualificaMedico?: string;
  /** Referti descrittivi: titolo dell'esame (es. "RM LOMBO-SACRALE") e testo. */
  titolo?: string;
  testo?: string;
  risultati: LabResult[];
  /** Cose da far notare all'utente nella schermata di revisione. */
  avvisi: string[];
}

// ───────────────────────────── utilità ─────────────────────────────

/** "07/04/1961", "7.4.61", "07-04-1961" → "1961-04-07" (solo se è una data valida). */
export function parseItalianDate(text: string): string | undefined {
  const m = /\b(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})\b/.exec(text);
  if (!m) return undefined;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  let y = Number(m[3]);
  if (m[3]!.length === 2) y += y > (new Date().getFullYear() % 100) ? 1900 : 2000;
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return undefined;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const CF = /^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/;
const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

// ───────────────────────── campi con etichetta ─────────────────────────

type Field = 'nomeCompleto' | 'cognome' | 'nome' | 'dataNascita' | 'codiceFiscale' | 'sesso' | 'dataEsame' | 'dataReferto' | 'numeroReferto' | 'medico';

/**
 * Etichetta → campo. L'etichetta deve essere seguita da ":" con il valore, oppure stare da sola
 * nella cella (valore nella cella accanto o sotto). Così "Nome esame" non è scambiato per "Nome".
 */
const label = (src: string) => new RegExp(String.raw`^(?:${src})(?:\s*:\s*(.*)|\s*:?)$`, 'iu');
const FIELDS: [Field, RegExp][] = [
  ['nomeCompleto', label(String.raw`cognome e nome|nome e cognome|paziente|assistito|nominativo|intestatario`)],
  ['cognome', label(String.raw`cognome`)],
  ['nome', label(String.raw`nome`)],
  ['dataNascita', label(String.raw`data di nascita|d\.?\s?nascita|nat[oa](?:\/a)?(?: il)?`)],
  ['codiceFiscale', label(String.raw`codice fiscale|c\.?\s?f\.?|cod\.?\s?fisc\.?`)],
  ['sesso', label(String.raw`sesso`)],
  ['dataEsame', label(String.raw`data (?:dell['’ ]?)?(?:esame|prelievo|esecuzione|accettazione|visita)|eseguito il|data`)],
  ['dataReferto', label(String.raw`data (?:del )?referto|data (?:di )?refertazione|data stampa|refertato il`)],
  ['numeroReferto', label(String.raw`n\.?\s?referto|numero referto|referto n\.?|n\.?\s?accettazione|n\.?\s?richiesta`)],
  ['medico', label(String.raw`medico refertante|refertante|medico responsabile|medico validatore`)],
];

const isFieldLabel = (text: string) => FIELDS.some(([, re]) => re.test(text)) || /^[\p{L} .'’]{2,40}:$/u.test(text);

function normalizeField(field: Field, raw: string): string | undefined {
  const v = clean(raw);
  if (!v || v.startsWith('[')) return undefined; // vuoto o già oscurato
  switch (field) {
    case 'dataNascita':
    case 'dataEsame':
    case 'dataReferto':
      return parseItalianDate(v);
    case 'codiceFiscale': {
      const cf = v.replace(/\s/g, '').toUpperCase();
      return CF.test(cf) ? cf : undefined;
    }
    case 'sesso': {
      const s = v[0]!.toUpperCase();
      return s === 'M' || s === 'F' ? s : undefined;
    }
    default:
      return v;
  }
}

/** Trova i campi con etichetta; restituisce anche le righe usate (da escludere dal testo del referto). */
function findLabeledFields(lines: LayoutLine[]) {
  const found = new Map<Field, string>();
  const usedLines = new Set<number>();

  lines.forEach((line, li) => {
    line.cells.forEach((cell, ci) => {
      for (const [field, re] of FIELDS) {
        const m = re.exec(cell.text);
        if (!m) continue;
        usedLines.add(li);
        if (found.has(field)) break;

        const candidates: string[] = [];
        if (m[1]?.trim()) candidates.push(m[1]);
        else {
          const next = line.cells[ci + 1];
          if (next && !isFieldLabel(next.text)) candidates.push(next.text);
          const below = valueBelow(lines, li, cell, next);
          if (below) candidates.push(below);
        }
        for (const c of candidates) {
          const v = normalizeField(field, c);
          if (v) {
            found.set(field, v);
            break;
          }
        }
        break;
      }
    });
  });
  return { found, usedLines };
}

/** Valore nella riga sotto, nella stessa colonna dell'etichetta (intestazioni a tabella). */
function valueBelow(lines: LayoutLine[], li: number, cell: LayoutCell, next?: LayoutCell) {
  const line = lines[li]!;
  const below = lines[li + 1];
  if (!below || below.page !== line.page || below.top - line.top > Math.max(cell.height, 8) * 3) return undefined;
  const to = next ? next.x - 1 : Infinity;
  const hit = below.cells.find((b) => b.x >= cell.x - 8 && b.x < to && !isFieldLabel(b.text));
  return hit?.text;
}

// ───────────────────────── tabella delle analisi ─────────────────────────

type Column = 'nome' | 'valore' | 'unita' | 'riferimento';
const HEADER: [Column, RegExp][] = [
  ['nome', /^(?:nome )?(?:esame|esami|analisi|test|parametro|parametri|descrizione|prestazione|determinazione)$/iu],
  ['valore', /^(?:risultat[oi]|esit[oi]|valore|valori|referto)$/iu],
  ['unita', /^(?:unit[àa](?: di misura)?|u\.?\s?m\.?|udm|misura)$/iu],
  ['riferimento', /^(?:valori di riferimento|valori normali|intervallo(?: di riferimento)?|range|riferiment[oi]|v\.?\s?r\.?|limiti)$/iu],
];

const VALUE = /^(?:[<>≤≥]\s*)?-?\d+(?:[.,]\d+)?(?:\s*[*HhLl↑↓+])?$|^(?:negativ[oa]|positiv[oa]|assente|presente|assenti|presenti|tracce|normale)$/iu;
const UNIT = /^(?:%|[a-zµμ]{1,6}(?:\/[a-zµμ0-9.^³]{1,8})+|[a-zµμ]{1,5}|x?\s?10\^?\d+\/[a-zµμ]+|u\/l|ui\/ml|mmol\/l|fl|pg|sec|ratio)$/iu;
const RANGE = /^(?:[<>≤≥]\s*\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?\s*[-–÷]\s*\d+(?:[.,]\d+)?)(?:\s*\S+)?$/u;

function splitFlag(valore: string): { valore: string; flag: boolean } {
  const m = /^(.*?)\s*([*HhLl↑↓])$/u.exec(valore);
  return m && /\d/.test(m[1]!) ? { valore: m[1]!, flag: true } : { valore, flag: false };
}

function makeResult(sezione: string | undefined, parts: Partial<Record<Column, string>>): LabResult | undefined {
  const nome = clean(parts.nome ?? '');
  const raw = clean(parts.valore ?? '');
  if (!nome || !raw || !/\p{L}/u.test(nome)) return undefined;
  const { valore, flag } = splitFlag(raw);
  const numero = parseItalianNumber(valore);
  const riferimento = parts.riferimento ? clean(parts.riferimento) : undefined;
  const r: LabResult = { nome, valore };
  if (sezione) r.sezione = sezione;
  if (numero !== undefined) r.numero = numero;
  // NFKC: il simbolo "micro" (µ) e la lettera greca (μ) diventano lo stesso carattere.
  if (parts.unita) r.unita = clean(parts.unita).normalize('NFKC');
  if (riferimento) r.riferimento = riferimento;
  const computed = isOutOfRange(numero, riferimento);
  if (flag || computed !== undefined) r.fuoriRange = flag || computed;
  return r;
}

/** Riga "sezione": una sola cella, senza numeri, in maiuscolo (es. "EMOCROMO", "CHIMICA CLINICA"). */
const isSection = (line: LayoutLine) =>
  line.cells.length === 1 && !/\d/.test(line.text) && line.text.length <= 60 && line.text === line.text.toLocaleUpperCase('it') && /\p{L}{3}/u.test(line.text);

function findLabResults(lines: LayoutLine[], skip: Set<number>) {
  const results: LabResult[] = [];
  const used = new Set<number>();
  let columns: { col: Column; x: number }[] | null = null;
  let sezione: string | undefined;

  lines.forEach((line, li) => {
    // 1) Intestazione di tabella: almeno "esame" + "risultato".
    const header = line.cells
      .map((c) => ({ c, col: HEADER.find(([, re]) => re.test(c.text))?.[0] }))
      .filter((h): h is { c: LayoutCell; col: Column } => !!h.col);
    if (header.some((h) => h.col === 'nome') && header.some((h) => h.col === 'valore')) {
      columns = header.map((h) => ({ col: h.col, x: h.c.x }));
      used.add(li);
      return;
    }
    if (skip.has(li)) return;
    if (isSection(line)) {
      sezione = line.text;
      return;
    }

    // 2) Righe sotto un'intestazione: ogni cella va nella colonna più vicina a sinistra.
    if (columns) {
      const parts: Partial<Record<Column, string>> = {};
      for (const cell of line.cells) {
        const col = [...columns].reverse().find((c) => cell.x >= c.x - 15) ?? columns[0]!;
        parts[col.col] = parts[col.col] ? `${parts[col.col]} ${cell.text}` : cell.text;
      }
      const r = parts.valore && VALUE.test(clean(parts.valore)) ? makeResult(sezione, parts) : undefined;
      if (r) {
        results.push(r);
        used.add(li);
      }
      return;
    }

    // 3) Senza intestazione: "Nome | valore | [unità] | [riferimento]".
    const [first, second, ...rest] = line.cells;
    if (!first || !second || !VALUE.test(second.text)) return;
    const parts: Partial<Record<Column, string>> = { nome: first.text, valore: second.text };
    for (const c of rest) {
      if (!parts.unita && UNIT.test(c.text)) parts.unita = c.text;
      else if (!parts.riferimento && RANGE.test(c.text)) parts.riferimento = c.text;
    }
    const r = makeResult(sezione, parts);
    if (r) {
      results.push(r);
      used.add(li);
    }
  });
  return { results, used };
}

// ───────────────────────── referto descrittivo ─────────────────────────

const FOOTER = /\bpag(?:ina|\.)?\s*\d+\s*(?:di|\/)\s*\d+|^pagina \d+$/iu;
const SIGNATURE_START = /^(?:(?:il|la|lo)\s+)?(?:medico|specialista|radiologo|direttore|direttrice|responsabile|dirigente)\b|^(?:dott|dr|prof)\.?|firmat[oa] digitalmente|documento firmato/iu;
const REPLACES = /sostituisce\b.*\bprecedente/iu;
const SIGNED_BY = /firmat[oa]\b.*?\bda\s+((?:dott|dr|prof)\S*\s+.+)$/iu;
const TITLE_NOTES = /\s*\((?:[^()]*\b(?:tsrm|eseguit[oa]|tecnico)\b[^()]*)\)\s*$/iu;

function buildText(lines: LayoutLine[]) {
  // Nuovo paragrafo quando lo spazio verticale tra due righe è molto più grande del solito.
  const gaps = lines.slice(1).map((l, i) => (l.page === lines[i]!.page ? l.top - lines[i]!.top : Infinity)).filter(Number.isFinite);
  const usual = gaps.length ? [...gaps].sort((a, b) => a - b)[Math.floor((gaps.length - 1) / 2)]! : 12;
  return lines
    .map((l, i) => {
      const prev = lines[i - 1];
      const gap = prev && prev.page === l.page ? l.top - prev.top : Infinity;
      return (i > 0 && gap > usual * 1.6 ? '\n' : '') + l.cells.map((c) => c.text).join(' ');
    })
    .join('\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

// ───────────────────────── estrattore ─────────────────────────

export function extractReport(lines: LayoutLine[]): ExtractedReport {
  const avvisi: string[] = [];
  const { found, usedLines } = findLabeledFields(lines);

  const report: ExtractedReport = { parser: { ...GENERIC_PARSER }, tipo: 'descrittivo', paziente: {}, risultati: [], avvisi };

  const nomeCompleto = found.get('nomeCompleto') ?? ([found.get('cognome'), found.get('nome')].filter(Boolean).join(' ') || undefined);
  if (nomeCompleto) report.paziente.nomeCompleto = nomeCompleto;
  const dataNascita = found.get('dataNascita');
  if (dataNascita) report.paziente.dataNascita = dataNascita;
  const cf = found.get('codiceFiscale');
  if (cf) report.paziente.codiceFiscale = cf;
  const sesso = found.get('sesso');
  if (sesso === 'M' || sesso === 'F') report.paziente.sesso = sesso;
  for (const f of ['dataEsame', 'dataReferto', 'numeroReferto', 'medico'] as const) {
    const v = found.get(f);
    if (v) report[f] = v;
  }

  // Dati scritti in mezzo al testo, senza ":" ("N.Referto 123", "eseguito il 01.02.2023", "firmato … da Dott. X").
  for (const line of lines) {
    const text = line.cells.map((c) => c.text).join(' ');
    if (!report.numeroReferto) {
      const m = /\bn\.?\s?referto\s*:?\s*([A-Z0-9][A-Z0-9/\-.]*)/iu.exec(text);
      if (m) report.numeroReferto = m[1]!.replace(/[.]$/, '');
    }
    if (!report.dataEsame) {
      const m = /\beseguit[oa] il\s+(\S+)/iu.exec(text);
      const d = m && parseItalianDate(m[1]!);
      if (d) report.dataEsame = d;
    }
    const signed = SIGNED_BY.exec(text);
    if (signed) {
      if (!report.medico && !signed[1]!.includes('[')) report.medico = clean(signed[1]!);
      const d = /\bil\s+(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/iu.exec(text);
      const date = d && parseItalianDate(d[1]!);
      if (date && !report.dataReferto) report.dataReferto = date;
    }
    if (REPLACES.test(text)) avvisi.push('Questo referto sostituisce una versione precedente: controlla di non averla già importata.');
  }

  // Analisi di laboratorio?
  const lab = findLabResults(lines, usedLines);
  if (lab.results.length >= 3) {
    report.tipo = 'laboratorio';
    report.risultati = lab.results;
  }

  // Referto descrittivo: tutto ciò che sta tra l'intestazione anagrafica e la firma.
  if (report.tipo === 'descrittivo') {
    const lastHeader = Math.max(-1, ...usedLines);
    const body: LayoutLine[] = [];
    let signatureAt = -1;
    lines.forEach((line, li) => {
      if (li <= lastHeader || usedLines.has(li) || signatureAt >= 0) return;
      const text = line.cells.map((c) => c.text).join(' ');
      if (FOOTER.test(text) || REPLACES.test(text)) return;
      if (/\bn\.?\s?referto\b/iu.test(text) && line.cells.length > 1) return;
      if (SIGNATURE_START.test(text) && body.length > 0) {
        signatureAt = li;
        return;
      }
      body.push(line);
    });

    // Firma: "Lo Specialista Neuroradiologo" + "Dott. X" nelle righe successive.
    if (signatureAt >= 0) {
      const sig = lines.slice(signatureAt, signatureAt + 4).map((l) => l.cells.map((c) => c.text).join(' '));
      const qual = /^(?:(?:il|la|lo)\s+)?((?:medico|specialista|radiologo|direttore|direttrice|responsabile|dirigente)\b.*)$/iu.exec(sig[0]!);
      if (qual) report.qualificaMedico = clean(qual[1]!);
      const doc = sig.find((s) => /^(?:dott|dr|prof)\S*\s+\S/iu.test(s));
      if (doc && !report.medico && !doc.includes('[')) report.medico = clean(doc);
    }

    const [first, ...rest] = body;
    if (first) {
      report.titolo = clean(first.cells.map((c) => c.text).join(' ').replace(TITLE_NOTES, ''));
      const testo = buildText(rest);
      if (testo) report.testo = testo;
    }
    if (!report.testo) avvisi.push('Non ho trovato il testo del referto: controlla il documento.');
  }

  if (!report.dataEsame) avvisi.push('Data dell’esame non trovata: inseriscila a mano.');
  return report;
}
