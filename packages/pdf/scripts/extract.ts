/**
 * Prova l'estrattore generico su un referto e mostra cosa ha capito (in JSON).
 *
 *   npm run pdf:estrai -- <referto.pdf | referto-anonimo.txt>
 *
 * Accetta sia un PDF sia un file anonimizzato (.txt) prodotto da `pdf:anonimizza`.
 * ATTENZIONE: su un PDF originale stampa a schermo anche i dati personali letti.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { buildLines, extractPdf, extractReport, parseLayoutText } from '../src';

const input = process.argv[2];
if (!input) {
  console.log('Uso: npm run pdf:estrai -- <referto.pdf | referto-anonimo.txt>');
  process.exit(1);
}
const rootDir = path.resolve(import.meta.dirname, '../../..');
const candidates = [path.resolve(process.env.INIT_CWD ?? process.cwd(), input), path.resolve(rootDir, input)];
const file = candidates.find((p) => existsSync(p));
if (!file) {
  console.error(`File non trovato: ${input}`);
  process.exit(1);
}

const lines = file.toLowerCase().endsWith('.pdf')
  ? buildLines(await extractPdf(new Uint8Array(readFileSync(file))))
  : parseLayoutText(readFileSync(file, 'utf8'));

console.log(JSON.stringify(extractReport(lines), null, 2));
