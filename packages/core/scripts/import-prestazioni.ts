/**
 * Importa (o aggiorna) nel database il catalogo delle prestazioni specialistiche della Regione Puglia.
 * Lo stesso aggiornamento si può fare dall'app: pagina Prestazioni, come amministratore.
 *
 *   npm run prestazioni:importa                                  scarica i file aggiornati dal portale SIST
 *   npm run prestazioni:importa -- catalogo.xlsx [tariffe.xlsx]  usa file già scaricati
 *
 * Fonte: Regione Puglia, portale SIST: "Catalogo Unico Regionale delle Prestazioni Specialistiche"
 * e "Nomenclatore Tariffario Completo" (tariffe e branche).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { loadRootEnv } from '../src/config';

loadRootEnv(path.resolve(import.meta.dirname, '../../..'));
const { HEALTH_SERVICES_PAGE_URL, downloadHealthServices, healthServiceRowsFromXlsx, healthServiceTariffsFromXlsx, replaceHealthServices } = await import('../src/index');
const { getPrisma } = await import('../src/db');

const [catalogFile, tariffFile] = process.argv.slice(2);
const read = (file: string) => readFileSync(path.resolve(process.env.INIT_CWD ?? process.cwd(), file));

let result: Awaited<ReturnType<typeof downloadHealthServices>>;
if (catalogFile) {
  console.log(`Leggo ${catalogFile}${tariffFile ? ` e ${tariffFile}` : ' (senza tariffe)'}…`);
  result = {
    rows: healthServiceRowsFromXlsx(read(catalogFile), tariffFile ? healthServiceTariffsFromXlsx(read(tariffFile)) : undefined),
    sources: { catalogSource: path.basename(catalogFile), tariffSource: tariffFile ? path.basename(tariffFile) : null },
  };
} else {
  console.log(`Scarico i file elencati in ${HEALTH_SERVICES_PAGE_URL}…`);
  result = await downloadHealthServices();
  console.log(`Catalogo: ${result.sources.catalogSource}`);
  console.log(`Tariffe:  ${result.sources.tariffSource ?? 'non trovate'}`);
}
const priced = result.rows.filter((r) => r.tariff !== null).length;
console.log(`${result.rows.length.toLocaleString('it-IT')} prestazioni trovate (${priced.toLocaleString('it-IT')} con tariffa), salvo nel database…`);
await replaceHealthServices(result.rows, result.sources);
console.log('Fatto.');
await getPrisma().$disconnect();
