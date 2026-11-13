import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { buildLines, extractPdf, extractReport, NoTextLayerError } from '../src';
import { ocrPdf, parseTsv, TooManyPagesError, wordsToItems } from '../src/ocr';
import { makeScannedPdf } from '../src/ocr/testing';

// Tutti i referti qui sotto sono INVENTATI.
const LAB = [
  { x: 50, y: 800, text: 'Paziente: MEVIO LINA' },
  { x: 350, y: 800, text: 'Data prelievo: 02/05/2025' },
  { x: 50, y: 760, text: 'Esame' },
  { x: 250, y: 760, text: 'Risultato' },
  { x: 330, y: 760, text: 'Unità di misura' },
  { x: 430, y: 760, text: 'Valori di riferimento' },
  { x: 50, y: 740, text: 'EMOCROMO' },
  { x: 50, y: 725, text: 'Emoglobina' },
  { x: 250, y: 725, text: '11,2 *' },
  { x: 330, y: 725, text: 'g/dL' },
  { x: 430, y: 725, text: '12,0 - 16,0' },
  { x: 50, y: 710, text: 'Piastrine' },
  { x: 250, y: 710, text: '245' },
  { x: 330, y: 710, text: 'x10^3/µL' },
  { x: 430, y: 710, text: '150 - 400' },
  { x: 50, y: 690, text: 'CHIMICA CLINICA' },
  { x: 50, y: 675, text: 'Glucosio' },
  { x: 250, y: 675, text: '131' },
  { x: 330, y: 675, text: 'mg/dL' },
  { x: 430, y: 675, text: '70 - 100' },
];

test('TSV di Tesseract: parole con il riquadro della loro riga', () => {
  const tsv = [
    'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext',
    '1\t1\t0\t0\t0\t0\t0\t0\t2480\t3508\t-1\t',
    '4\t1\t1\t1\t1\t0\t100\t200\t500\t40\t-1\t',
    '5\t1\t1\t1\t1\t1\t100\t205\t180\t30\t96.5\tGlucosio',
    '5\t1\t1\t1\t1\t2\t400\t210\t60\t25\t61\t131',
    '5\t1\t1\t1\t1\t3\t480\t210\t10\t25\t95\t ',
  ].join('\n');
  const words = parseTsv(tsv);
  assert.deepEqual(words, [
    { text: 'Glucosio', confidence: 96.5, x0: 100, x1: 280, lineY0: 200, lineY1: 240 },
    { text: '131', confidence: 61, x0: 400, x1: 460, lineY0: 200, lineY1: 240 },
  ]);
  // A 300 DPI (scala 300/72) le coordinate tornano in punti PDF; parole della stessa riga, stessa altezza.
  const items = wordsToItems(words, 300 / 72);
  assert.equal(items[0]!.x, 24);
  assert.equal(items[0]!.top, items[1]!.top);
});

test('scansione finta: nessun testo selezionabile, l’OCR lo ricostruisce e il referto viene letto', { timeout: 120_000 }, async () => {
  const scan = await makeScannedPdf([LAB], { noise: 0.01 });
  await assert.rejects(extractPdf(scan), NoTextLayerError);

  const doc = await ocrPdf(scan, { engine: 'wasm' });
  assert.equal(doc.ocr.pages, 1);
  assert.ok(doc.ocr.confidence >= 70, `affidabilità troppo bassa: ${doc.ocr.confidence}`);

  const r = extractReport(buildLines(doc));
  assert.equal(r.tipo, 'laboratorio');
  assert.equal(r.dataPrelievo, '2025-05-02');
  const byName = new Map(r.risultati.map((x) => [x.nome, x]));
  assert.equal(byName.get('Emoglobina')?.valore, '11,2');
  assert.equal(byName.get('Emoglobina')?.riferimento, '12,0 - 16,0');
  assert.equal(byName.get('Glucosio')?.valore, '131');
});

test('limite di pagine: la scansione troppo lunga viene rifiutata prima dell’OCR', { timeout: 60_000 }, async () => {
  const scan = await makeScannedPdf([[{ x: 50, y: 800, text: 'Pagina' }], [{ x: 50, y: 800, text: 'Pagina' }]], { dpi: 72 });
  await assert.rejects(ocrPdf(scan, { engine: 'wasm', maxPages: 1 }), TooManyPagesError);
});

const hasNativeTesseract = spawnSync('tesseract', ['--list-langs'], { encoding: 'utf8' }).stdout?.includes('ita') ?? false;

test('Tesseract nativo (solo se installato con la lingua italiana)', { skip: !hasNativeTesseract && 'tesseract non installato', timeout: 120_000 }, async () => {
  const doc = await ocrPdf(await makeScannedPdf([LAB]), { engine: 'native' });
  const r = extractReport(buildLines(doc));
  assert.equal(r.risultati.find((x) => x.nome === 'Glucosio')?.valore, '131');
});
