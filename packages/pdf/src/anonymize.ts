import { randomInt } from 'node:crypto';
import type { LayoutLine } from './layout';

/**
 * Anonimizzazione di un referto già scomposto in righe e celle.
 * Obiettivo: conservare la STRUTTURA (intestazioni, nomi dei parametri, unità, colonne)
 * eliminando dati personali e valori clinici. È volutamente aggressiva: meglio oscurare
 * qualcosa in più che lasciar passare un dato personale. Il risultato va comunque riletto.
 */

export interface AnonymizeOptions {
  /** Nomi e cognomi da oscurare ovunque compaiano (oltre a quelli trovati automaticamente). */
  names?: string[];
}

export interface AnonymizeStats {
  campiPersonali: number;
  nomi: number;
  codiciFiscali: number;
  email: number;
  telefoni: number;
  indirizzi: number;
  cifreRimescolate: number;
}

const L = '\\p{L}';

/** Etichette dei campi anagrafici: ciò che le segue è un dato personale. */
const PERSONAL_LABEL = new RegExp(
  String.raw`^(paziente|assistito|sig\.?(?:ra)?|cognome(?: e nome)?|nome(?: e cognome)?|nominativo|intestatario|` +
    String.raw`nat[oa](?:\/a)?(?: il| a)?|data di nascita|d\.?\s?nascita|luogo di nascita|sesso|et[aà]|` +
    String.raw`indirizzo|residente(?: a| in)?|residenza|domicilio|comune|citt[aà]|` +
    String.raw`c\.?\s?f\.?|codice fiscale|cod\.?\s?fisc\.?|tessera(?: sanitaria)?|` +
    String.raw`tel(?:efono)?\.?|cell(?:ulare)?\.?|e-?mail|` +
    String.raw`medico(?: curante| richiedente| prescrittore| di base| refertante| responsabile| esecutore)?|richiedente|prescrittore|` +
    String.raw`refertante|(?:il |la )?(?:direttore|direttrice|responsabile|dirigente)(?: sanitari[oa]| medico| biologo| del laboratorio| di laboratorio)?|` +
    String.raw`(?:il |la )?biolog[oa]|firma(?: del medico)?|operatore|tecnico|` +
    String.raw`id\.? paziente|cod(?:ice)?\.? paziente|n\.? ?cartella|n\.? ?accettazione|accettazione|n\.? ?prelievo|` +
    String.raw`n\.? ?richiesta|codice a barre|barcode|impegnativa|ricetta)` +
    // L'etichetta deve essere seguita da ":" (es. "Paziente: …") oppure stare da sola nella cella
    // (il valore è nella cella dopo). Così "Nome esame" (intestazione di colonna) non viene toccato.
    String.raw`(?:\s*:\s*(.*)|\s*)$`,
  'iu',
);

/** Parole tipiche dei referti: non vanno mai trattate come nomi di persona. */
const NOT_NAMES = new Set(
  (
    'esame esami analisi valore valori risultato risultati unità unita misura riferimento intervallo ' +
    'laboratorio referto data ora note metodo materiale campione siero sangue urine plasma ' +
    'pagina pag totale dott dottore dottoressa medico sig sigra signor signora prof ' +
    'direttore direttrice responsabile dirigente sanitario sanitaria biologo biologa ' +
    'firmato firmata digitalmente validato refertato'
  ).split(' '),
);

/** Etichette i cui valori sono nomi di persona: le parole trovate vengono oscurate in tutto il documento. */
const NAME_LABELS =
  /^(paziente|assistito|sig|cognome|nome|nominativo|intestatario|medico|richiedente|prescrittore|refertante|il |la |direttor|direttrice|responsabile|dirigente|biolog|firma|operatore|tecnico)/iu;

/** Rende le lettere di un pezzo di regex insensibili a maiuscole/minuscole ("dott" → "[dD][oO][tT][tT]"). */
const anyCase = (src: string) =>
  src.replace(/\[[^\]]*\]|\\.|[a-z]/g, (tok) =>
    tok.length > 1 ? (tok.startsWith('[') ? tok.replace(/[a-z]/g, (c) => c + c.toUpperCase()) : tok) : `[${tok}${tok.toUpperCase()}]`,
  );

/** Nomi di persona: da 1 a 4 parole che iniziano con la maiuscola ("Rossi Mario", "ROSSI M."). */
const PERSON = String.raw`((?:[A-ZÀ-Ý][${L}'’.\-]*\s*){1,4})`;

/**
 * Titolo + nome: "Dott. Rossi", "DOTT.SSA BIANCHI ANNA", "Dr.Neri", "Prof Caio".
 * Il titolo è riconosciuto in qualunque combinazione di maiuscole; il nome deve iniziare con la maiuscola.
 */
const TITLE =
  anyCase(String.raw`(?:dott(?:\.?ssa|oressa|ore|or)?|dr(?:\.?ssa)?|prof(?:\.?ssa|essoressa|essore)?|sig(?:\.?ra|nora|nor)?|egr|gent(?:\.?mo|\.?ma)?)`) +
  String.raw`\.?(?:(?<=\.)\s*|\s+)`;

const HONORIFIC = new RegExp(String.raw`\b(${TITLE})` + PERSON, 'gu');

/** "Firmato digitalmente da Rossi Mario", "Validato da: BIANCHI", "Refertato da Dr. Neri" (il titolo resta). */
const SIGNED_BY = new RegExp(
  String.raw`\b(` +
    anyCase(String.raw`(?:firmat[oa](?: digitalmente)?|validat[oa]|refertat[oa]|sottoscritt[oa]|eseguit[oa]) da`) +
    String.raw`\s*:?\s*(?:${TITLE})?)` +
    PERSON,
  'gu',
);

/**
 * Qualifica + ":" + nome anche a metà frase: "( TSRM: Rossi Anna eseguito il …)", "Tecnico: Bianchi".
 * (Le stesse etichette all'inizio della cella sono già gestite da PERSONAL_LABEL.)
 */
const ROLE_INLINE = new RegExp(
  String.raw`\b(` +
    anyCase(
      String.raw`(?:tsrm|tslb|tecnico(?: di radiologia| di laboratorio)?|operatore|infermier[ea]|ostetrica|esecutore|refertante|` +
        String.raw`radiologo|medico(?: refertante| esecutore| validatore| responsabile)?|biolog[oa]|validatore|specialista)`,
    ) +
    String.raw`\s*:\s*(?:${TITLE})?)` +
    PERSON,
  'gu',
);

/** Tutti i modi in cui un nome di persona viene introdotto nel testo (l'ordine conta: i più specifici prima). */
const NAME_PATTERNS = [SIGNED_BY, ROLE_INLINE, HONORIFIC];

const PATTERNS: [keyof AnonymizeStats, RegExp, string][] = [
  ['codiciFiscali', /\b[A-Z]{6}\s?\d{2}[A-Z]\d{2}\s?[A-Z]\d{3}[A-Z]\b/giu, '[CODICE FISCALE]'],
  ['email', /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/gu, '[EMAIL]'],
  ['telefoni', /(?:\+39[\s.]?)?\b(?:3\d{2}[\s./-]?\d{6,7}|0\d{1,3}[\s./-]?\d{5,8})\b/gu, '[TELEFONO]'],
  [
    'indirizzi',
    new RegExp(
      String.raw`\b(?:via|viale|piazza|p\.?zza|piazzale|corso|c\.so|largo|vicolo|strada|contrada|loc\.|localit[aà])\s+[^|,;]{2,50}?(?:,?\s*(?:n\.?\s*)?\d+\s?[a-z]?\b)?(?=$|[|,;])`,
      'giu',
    ),
    '[INDIRIZZO]',
  ],
];

function emptyStats(): AnonymizeStats {
  return { campiPersonali: 0, nomi: 0, codiciFiscali: 0, email: 0, telefoni: 0, indirizzi: 0, cifreRimescolate: 0 };
}

function addNameWords(target: Set<string>, text: string) {
  for (const word of text.split(/[\s,;|/]+/u)) {
    const clean = word.replace(/[^\p{L}'’-]/gu, '');
    // Parole di almeno 3 lettere; sigle mediche brevi (es. "HB") non vengono toccate.
    const lower = clean.toLocaleLowerCase('it');
    if (clean.length >= 3 && !NOT_NAMES.has(lower)) target.add(lower);
  }
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Sostituisce ogni cifra con una cifra casuale SEMPRE diversa dall'originale, mantenendo formato e
 * lunghezza (una cifra diversa da 0 resta diversa da 0, così "07" non diventa "00").
 */
function scrambleDigits(text: string, stats: AnonymizeStats): string {
  return text.replace(/\d/g, (d) => {
    stats.cifreRimescolate++;
    const options = (d === '0' ? '123456789' : '123456789'.replace(d, '')).split('');
    return options[randomInt(0, options.length)]!;
  });
}

const cellKey = (line: number, cell: number) => `${line}:${cell}`;

/**
 * 1ª passata: individua le celle che contengono valori di campi anagrafici e raccoglie i nomi.
 * Gestisce due impaginazioni:
 *  - "Etichetta: valore" o "Etichetta | valore" sulla stessa riga;
 *  - riga di intestazione ("Cognome | Nome | Data di nascita") con i valori nella riga sotto, in colonna.
 */
function planRedactions(lines: LayoutLine[]) {
  const valueCells = new Set<string>();
  const names = new Set<string>();
  const isLabel = (text: string) => PERSONAL_LABEL.test(text);

  lines.forEach((line, li) => {
    // Riga di intestazione di tabella: almeno 2 etichette da sole e SENZA ":" ("Cognome | Nome | Sesso").
    // "Indirizzo: | … | Sesso: | M" invece ha i valori accanto, sulla stessa riga.
    const headerLabels = line.cells.filter((c) => {
      const m = PERSONAL_LABEL.exec(c.text);
      return m && !m[2]?.trim() && !c.text.trimEnd().endsWith(':');
    }).length;
    const headerRow = headerLabels >= 2;

    line.cells.forEach((cell, ci) => {
      for (const re of NAME_PATTERNS) for (const h of cell.text.matchAll(re)) addNameWords(names, h[2]!);
      const m = PERSONAL_LABEL.exec(cell.text);
      if (!m) return;
      const isName = NAME_LABELS.test(m[1]!);

      if (m[2]?.trim()) {
        if (isName) addNameWords(names, m[2]);
        return;
      }
      const next = line.cells[ci + 1];
      if (!headerRow && next && !isLabel(next.text)) {
        valueCells.add(cellKey(li, ci + 1));
        if (isName) addNameWords(names, next.text);
        return;
      }
      // Valore nella riga sotto, nella stessa colonna dell'etichetta.
      const below = lines[li + 1];
      if (!below || below.page !== line.page || below.top - line.top > Math.max(cell.height, 8) * 3) return;
      const from = cell.x - 8;
      const to = next ? next.x - 1 : Infinity;
      below.cells.forEach((b, bi) => {
        if (b.x >= from && b.x < to && !isLabel(b.text)) {
          valueCells.add(cellKey(li + 1, bi));
          if (isName) addNameWords(names, b.text);
        }
      });
    });
  });
  return { valueCells, names };
}

/**
 * Nomi di persona trovati automaticamente in un referto. Usati per oscurare gli stessi nomi
 * anche negli altri referti elaborati insieme (dove magari compaiono senza etichetta).
 */
export function collectNames(lines: LayoutLine[]): string[] {
  return [...planRedactions(lines).names];
}

export function anonymizeLines(lines: LayoutLine[], opts: AnonymizeOptions = {}): { lines: LayoutLine[]; stats: AnonymizeStats } {
  const stats = emptyStats();
  const { valueCells, names } = planRedactions(lines);
  for (const n of opts.names ?? []) addNameWords(names, n);

  const nameRegex = names.size
    ? new RegExp(String.raw`(?<![${L}])(?:${[...names].sort((a, b) => b.length - a.length).map(escapeRegExp).join('|')})(?![${L}])`, 'giu')
    : null;

  // 2ª passata: oscura.
  const out: LayoutLine[] = lines.map((line, li) => {
    const cells = line.cells.map((cell, ci) => {
      let text = cell.text;

      if (valueCells.has(cellKey(li, ci))) {
        stats.campiPersonali++;
        text = '[DATO PERSONALE]';
      } else {
        const m = PERSONAL_LABEL.exec(text);
        if (m?.[2]?.trim()) {
          const label = text.slice(0, text.length - m[2].length).trimEnd();
          stats.campiPersonali++;
          text = `${label} [DATO PERSONALE]`;
        }
      }

      for (const re of NAME_PATTERNS) {
        text = text.replace(re, (_all, title: string, who: string) => {
          stats.nomi++;
          // Il titolo può finire attaccato al nome ("Dr.Neri"): sempre uno spazio prima di [NOME].
          return `${title.trimEnd()} [NOME]${/\s$/.test(who) ? ' ' : ''}`;
        });
      }
      if (nameRegex) {
        text = text.replace(nameRegex, () => {
          stats.nomi++;
          return '[NOME]';
        });
      }
      for (const [key, regex, label] of PATTERNS) {
        text = text.replace(regex, () => {
          stats[key]++;
          return label;
        });
      }
      text = scrambleDigits(text, stats);
      return { ...cell, text };
    });
    return { ...line, cells, text: cells.map((c) => c.text).join(' | ') };
  });

  return { lines: out, stats };
}

/** Formato testuale leggibile, con le coordinate necessarie a progettare i parser. */
export function formatLayout(lines: LayoutLine[], meta: { pages: { number: number; width: number; height: number }[]; producer?: string }) {
  const out: string[] = [
    '# Referto ANONIMIZZATO (generato da @alby/pdf).',
    '# Prima di condividerlo rileggilo tutto: se trovi ancora un dato personale, cancellalo a mano.',
    '# Formato: [distanza dall’alto]  @posizione-x  testo-della-cella   @posizione-x  testo…',
    `# Pagine: ${meta.pages.length}${meta.producer ? ` · Programma che ha generato il PDF: ${meta.producer}` : ''}`,
  ];
  for (const page of meta.pages) {
    out.push('', `=== Pagina ${page.number} (${page.width} x ${page.height}) ===`);
    for (const line of lines.filter((l) => l.page === page.number)) {
      const cells = line.cells.map((c) => `@${c.x.toFixed(0).padStart(3)}  ${c.text}`).join('    ');
      out.push(`[${line.top.toFixed(0).padStart(4)}]  ${cells}`);
    }
  }
  return out.join('\n') + '\n';
}
