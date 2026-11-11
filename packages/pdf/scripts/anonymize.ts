/**
 * Crea una versione anonimizzata (solo testo + posizioni) di uno o più referti PDF.
 *
 *   npm run pdf:anonimizza -- <file.pdf | cartella> [altri…] [--nomi "Mario Rossi, Anna Bianchi"]
 *
 * I file prodotti vanno in .data/referti-anonimi/ (esclusa da git) con nomi neutri ricavati
 * dall'impronta del contenuto (referto-3fa9c21b.txt): rilanciando, lo stesso PDF sovrascrive il suo file.
 * A schermo non viene mai stampato il contenuto né il nome dei file originali.
 * `--nomi` è facoltativo: i nomi nei campi anagrafici vengono trovati da soli.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  anonymizeLines,
  buildLines,
  collectNames,
  extractPdf,
  formatLayout,
  NoTextLayerError,
  type LayoutLine,
  type PdfDocument,
} from '../src';

const rootDir = path.resolve(import.meta.dirname, '../../..');
const callerDir = process.env.INIT_CWD ?? process.cwd();
const outDir = path.join(rootDir, '.data', 'referti-anonimi');

const args = process.argv.slice(2);
const names: string[] = [];
const inputs: string[] = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--nomi') names.push(...(args[++i] ?? '').split(','));
  else inputs.push(args[i]!);
}

if (inputs.length === 0) {
  console.log("Uso: npm run pdf:anonimizza -- <file.pdf | cartella> [--nomi \"Mario Rossi, Anna Bianchi\"]  (--nomi è facoltativo)");
  process.exit(1);
}

const files: string[] = [];
for (const input of inputs) {
  // Percorso relativo alla cartella da cui è stato lanciato il comando, oppure alla radice del progetto.
  const candidates = [path.resolve(callerDir, input), path.resolve(rootDir, input)];
  const full = candidates.find((p) => existsSync(p)) ?? candidates[0]!;
  try {
    if (statSync(full).isDirectory()) {
      for (const f of readdirSync(full).sort()) if (f.toLowerCase().endsWith('.pdf')) files.push(path.join(full, f));
    } else {
      files.push(full);
    }
  } catch {
    console.error(`Percorso non trovato: ${input}`);
    process.exit(1);
  }
}

mkdirSync(outDir, { recursive: true });

// 1) Legge tutti i PDF e raccoglie i nomi trovati automaticamente in ciascuno.
const parsed: { label: string; doc: PdfDocument; lines: LayoutLine[] }[] = [];
const allNames = new Set(names);
for (const [i, file] of files.entries()) {
  const data = new Uint8Array(readFileSync(file));
  // Nome del file d'uscita = impronta del contenuto: rilanciando, lo stesso PDF sovrascrive il suo file.
  const label = `referto-${createHash('sha256').update(data).digest('hex').slice(0, 8)}`;
  try {
    const doc = await extractPdf(data);
    const lines = buildLines(doc);
    for (const n of collectNames(lines)) allNames.add(n);
    parsed.push({ label, doc, lines });
  } catch (err) {
    console.error(`✖ file n.${i + 1}: ${err instanceof NoTextLayerError ? err.message : 'impossibile leggere il PDF'}`);
  }
}

// 2) Anonimizza ogni referto con TUTTI i nomi trovati (un nome può comparire senza etichetta in un altro referto).
for (const { label, doc, lines: raw } of parsed) {
  const { lines, stats } = anonymizeLines(raw, { names: [...allNames] });
  const [producer] = anonymizeLines(
    [{ page: 0, top: 0, text: '', cells: [{ text: doc.info.producer ?? '', x: 0, right: 0, height: 0 }] }],
    { names: [...allNames] },
  ).lines[0]!.cells.map((c) => c.text);
  writeFileSync(path.join(outDir, `${label}.txt`), formatLayout(lines, { pages: doc.pages, producer }), 'utf8');
  console.log(
    `✔ ${label}.txt  ${doc.pages.length} pag., ${lines.length} righe — oscurati: ` +
      `${stats.campiPersonali} campi anagrafici, ${stats.nomi} nomi, ${stats.codiciFiscali} cod. fiscali, ` +
      `${stats.email} email, ${stats.telefoni} telefoni, ${stats.indirizzi} indirizzi; ${stats.cifreRimescolate} cifre rimescolate`,
  );
}

console.log(`\nFile in: ${outDir}`);
console.log('Rileggili prima di condividerli: se vedi ancora un dato personale, cancellalo a mano.');
