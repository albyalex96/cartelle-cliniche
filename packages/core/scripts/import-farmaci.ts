/**
 * Importa (o aggiorna) l'elenco dei farmaci AIFA nel database, da riga di comando.
 * Lo stesso aggiornamento si può fare dall'app: Amministrazione → Elenco farmaci.
 *
 *   npm run farmaci:importa                      scarica il file aggiornato dal sito AIFA
 *   npm run farmaci:importa -- percorso/file.csv usa un file già scaricato
 *
 * Fonte: AIFA, "Lista aggiornata dei Farmaci" (dati aperti, licenza CC BY 4.0).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { loadRootEnv } from '../src/config';

loadRootEnv(path.resolve(import.meta.dirname, '../../..'));
const { AIFA_CATALOG_URL, decodeCsv, downloadDrugCatalog, drugRowsFromCsv, replaceDrugCatalog } = await import('../src/index');
const { getPrisma } = await import('../src/db');

const file = process.argv[2];
let bytes: Uint8Array;
if (file) {
  console.log(`Leggo ${file}…`);
  bytes = readFileSync(path.resolve(process.env.INIT_CWD ?? process.cwd(), file));
} else {
  console.log(`Scarico ${AIFA_CATALOG_URL}…`);
  bytes = await downloadDrugCatalog();
}
const rows = drugRowsFromCsv(decodeCsv(bytes));
console.log(`${rows.length.toLocaleString('it-IT')} confezioni trovate, salvo nel database…`);
const t = Date.now();
await replaceDrugCatalog(rows);
console.log(`Fatto in ${Math.round((Date.now() - t) / 1000)} s.`);
await getPrisma().$disconnect();
