/**
 * Misura quanto costa l'OCR su questa macchina, con scansioni FINTE (nessun dato reale).
 *
 *   npm run ocr:benchmark -w @alby/pdf -- [pagine] [motore]
 *
 * pagine: numero di pagine A4 piene (predefinito 3); motore: wasm | native | tutti (predefinito tutti).
 */
import { spawnSync } from 'node:child_process';
import { ocrPdf } from '../src/ocr';
import { makeScannedPdf } from '../src/ocr/testing';

const pagesCount = Number(process.argv[2] ?? 3);
const which = process.argv[3] ?? 'tutti';

const PARAMS = ['Emoglobina', 'Ematocrito', 'Leucociti', 'Piastrine', 'Glucosio', 'Creatinina', 'Azotemia', 'Sodio', 'Potassio', 'Colesterolo totale'];
const UNITS = ['g/dL', '%', 'x10^3/µL', 'mg/dL', 'mmol/L', 'U/L'];

/** Una pagina A4 piena: intestazione e 40 righe di valori inventati. */
function fakePage(n: number) {
  const items = [
    { x: 50, y: 800, text: `Laboratorio Analisi Esempio - pagina ${n}` },
    { x: 50, y: 780, text: 'Paziente: ROSSI MARIO' },
    { x: 350, y: 780, text: 'Data prelievo: 02/05/2025' },
    { x: 50, y: 750, text: 'Esame' },
    { x: 250, y: 750, text: 'Risultato' },
    { x: 330, y: 750, text: 'Unità di misura' },
    { x: 430, y: 750, text: 'Valori di riferimento' },
  ];
  for (let i = 0; i < 40; i++) {
    const y = 730 - i * 16;
    const v = ((i * 37 + n * 11) % 900) / 10 + 1;
    items.push(
      { x: 50, y, text: `${PARAMS[i % PARAMS.length]} ${Math.floor(i / PARAMS.length) + 1}` },
      { x: 250, y, text: v.toFixed(1).replace('.', ',') },
      { x: 330, y, text: UNITS[i % UNITS.length]! },
      { x: 430, y, text: `${(v * 0.7).toFixed(1).replace('.', ',')} - ${(v * 1.3).toFixed(1).replace('.', ',')}` },
    );
  }
  return items;
}

const engines: ('wasm' | 'native')[] = [];
if (which === 'tutti' || which === 'wasm') engines.push('wasm');
if (which === 'tutti' || which === 'native') {
  const ok = spawnSync('tesseract', ['--list-langs'], { encoding: 'utf8' }).stdout?.includes('ita');
  if (ok) engines.push('native');
  else console.log('(Tesseract nativo non installato con la lingua "ita": salto il motore "native")');
}

console.log(`Creo una scansione finta di ${pagesCount} pagine A4 (200 DPI, con rumore)…`);
const scan = await makeScannedPdf(Array.from({ length: pagesCount }, (_, i) => fakePage(i + 1)), { noise: 0.005 });
console.log(`PDF: ${(scan.byteLength / 1024).toFixed(0)} KB\n`);

for (const engine of engines) {
  global.gc?.();
  const baseRss = process.memoryUsage().rss;
  let peak = baseRss;
  const sampler = setInterval(() => (peak = Math.max(peak, process.memoryUsage().rss)), 25);
  const cpu = process.cpuUsage();
  const doc = await ocrPdf(scan, { engine, maxPages: 100, pageTimeoutMs: 300_000 });
  clearInterval(sampler);
  const used = process.cpuUsage(cpu);
  const perPage = doc.ocr.ms / doc.ocr.pages / 1000;
  console.log(`Motore ${engine}:`);
  console.log(`  tempo totale     ${(doc.ocr.ms / 1000).toFixed(1)} s  (${perPage.toFixed(1)} s per pagina)`);
  console.log(`  CPU del processo ${((used.user + used.system) / 1e6).toFixed(1)} s${engine === 'native' ? '  (+ il programma tesseract, non conteggiato qui)' : ''}`);
  console.log(`  memoria          +${((peak - baseRss) / 1024 / 1024).toFixed(0)} MB oltre i ${(baseRss / 1024 / 1024).toFixed(0)} MB di partenza`);
  console.log(`  parole ${doc.ocr.words}, affidabilità media ${doc.ocr.confidence}%, incerte ${doc.uncertainWords.length}\n`);
}
