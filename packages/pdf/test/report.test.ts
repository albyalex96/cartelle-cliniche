import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildLines, extractPdf, extractReport, formatLayout, parseItalianDate, parseItalianNumber, parseLayoutText } from '../src';
import { formatUnit } from '@alby/shared';
import { makePdf } from '../src/testing';

// Tutti i referti qui sotto sono INVENTATI.
const lines = async (items: { x: number; y: number; text: string }[]) => buildLines(await extractPdf(makePdf([items])));

test('date e numeri all’italiana', () => {
  assert.equal(parseItalianDate('07/04/1961'), '1961-04-07');
  assert.equal(parseItalianDate('eseguito il 1.2.2023 10:15'), '2023-02-01');
  assert.equal(parseItalianDate('31.02.2023'), undefined);
  assert.equal(parseItalianDate('18.25.4172'), undefined);
  assert.equal(parseItalianNumber('13,8'), 13.8);
  assert.equal(parseItalianNumber('1.234,5'), 1234.5);
  assert.equal(parseItalianNumber('< 0,5'), 0.5);
  assert.equal(parseItalianNumber('Negativo'), undefined);
});

test('referto descrittivo (risonanza): intestazione, titolo, testo, firma', async () => {
  const r = extractReport(
    await lines([
      { x: 31, y: 667, text: 'Cognome e nome: TIZIONI ARTURO' },
      { x: 377, y: 667, text: 'Data di nascita: 03/11/1958' },
      { x: 31, y: 652, text: 'Codice fiscale:' },
      { x: 121, y: 652, text: 'TZZRTR58S03Z999K' },
      { x: 377, y: 652, text: 'Sesso:' },
      { x: 454, y: 652, text: 'M' },
      { x: 31, y: 637, text: 'Reparto:' },
      { x: 121, y: 637, text: 'Esterni' },
      { x: 31, y: 622, text: 'Data esame:' },
      { x: 121, y: 622, text: '14.03.2024' },
      { x: 30, y: 561, text: 'RM GINOCCHIO DESTRO (SENZA CONTRASTO) ( TSRM: Rondelli Pia eseguito il 14.03.2024 09:12)' },
      { x: 28, y: 470, text: 'Menisco mediale integro.' },
      { x: 28, y: 459, text: 'Lieve versamento articolare.' },
      { x: 28, y: 430, text: 'Conclusioni: quadro nei limiti.' },
      { x: 387, y: 194, text: 'Lo Specialista Radiologo' },
      { x: 401, y: 177, text: 'Dott. Amedeo Filani' },
      { x: 79, y: 127, text: 'Documento firmato digitalmente il 15.03.2024 alle ore 11:02 da Dott. Amedeo Filani' },
      { x: 380, y: 109, text: 'N.Referto 55120' },
      { x: 497, y: 109, text: 'Pagina 1' },
      { x: 532, y: 109, text: 'di 1' },
    ]),
  );
  assert.equal(r.tipo, 'descrittivo');
  assert.deepEqual(r.paziente, { nomeCompleto: 'TIZIONI ARTURO', dataNascita: '1958-11-03', codiceFiscale: 'TZZRTR58S03Z999K', sesso: 'M' });
  assert.equal(r.dataEsame, '2024-03-14');
  assert.equal(r.dataReferto, '2024-03-15');
  assert.equal(r.numeroReferto, '55120');
  assert.equal(r.titolo, 'RM GINOCCHIO DESTRO (SENZA CONTRASTO)');
  assert.equal(r.testo, 'Menisco mediale integro.\nLieve versamento articolare.\n\nConclusioni: quadro nei limiti.');
  assert.equal(r.medico, 'Dott. Amedeo Filani');
  assert.equal(r.qualificaMedico, 'Specialista Radiologo');
  assert.deepEqual(r.avvisi, []);
});

test('analisi con intestazione di tabella: colonne, sezioni, fuori range', async () => {
  const r = extractReport(
    await lines([
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
      { x: 50, y: 710, text: 'Leucociti' },
      { x: 250, y: 710, text: '6,4' },
      { x: 330, y: 710, text: 'x10^3/µL' },
      { x: 430, y: 710, text: '4,0 - 10,0' },
      { x: 50, y: 690, text: 'CHIMICA CLINICA' },
      { x: 50, y: 675, text: 'Glucosio' },
      { x: 250, y: 675, text: '131' },
      { x: 330, y: 675, text: 'mg/dL' },
      { x: 430, y: 675, text: '70 - 100' },
      { x: 50, y: 660, text: 'Proteina C reattiva' },
      { x: 250, y: 660, text: '< 0,5' },
      { x: 330, y: 660, text: 'mg/dL' },
      { x: 430, y: 660, text: '< 0,5' },
    ]),
  );
  assert.equal(r.tipo, 'laboratorio');
  assert.equal(r.dataPrelievo, '2025-05-02');
  assert.equal(r.dataEsame, '2025-05-02', 'senza "data esame" vale quella del prelievo');
  assert.equal(r.paziente.nomeCompleto, 'MEVIO LINA');
  assert.deepEqual(
    r.risultati.map((x) => [x.sezione, x.nome, x.valore, x.numero, x.unita, x.riferimento, x.fuoriRange]),
    [
      ['EMOCROMO', 'Emoglobina', '11,2', 11.2, 'g/dL', '12,0 - 16,0', true],
      ['EMOCROMO', 'Leucociti', '6,4', 6.4, 'x10^3/μL', '4,0 - 10,0', false],
      ['CHIMICA CLINICA', 'Glucosio', '131', 131, 'mg/dL', '70 - 100', true],
      ['CHIMICA CLINICA', 'Proteina C reattiva', '< 0,5', 0.5, 'mg/dL', '< 0,5', false],
    ],
  );
});

test('data del prelievo distinta da accettazione e referto, anche scritta in vari modi', async () => {
  const base = [
    { x: 50, y: 700, text: 'Emoglobina' },
    { x: 220, y: 700, text: '13,1' },
    { x: 50, y: 685, text: 'Glucosio' },
    { x: 220, y: 685, text: '90' },
    { x: 50, y: 670, text: 'Sodio' },
    { x: 220, y: 670, text: '140' },
  ];
  const a = extractReport(
    await lines([
      { x: 50, y: 800, text: 'Data accettazione:' },
      { x: 160, y: 800, text: '03/05/2025' },
      { x: 300, y: 800, text: 'Data e ora prelievo:' },
      { x: 420, y: 800, text: '02/05/2025 07:45' },
      { x: 50, y: 785, text: 'Data referto: 06/05/2025' },
      ...base,
    ]),
  );
  assert.deepEqual([a.dataEsame, a.dataPrelievo, a.dataReferto], ['2025-05-03', '2025-05-02', '2025-05-06']);

  // Etichetta in una riga, valore nella riga sotto (intestazioni "a tabella").
  const b = extractReport(
    await lines([
      { x: 50, y: 800, text: 'Prelievo del' },
      { x: 200, y: 800, text: 'N. accettazione' },
      { x: 50, y: 788, text: '28.04.2025' },
      { x: 200, y: 788, text: 'A123' },
      ...base,
    ]),
  );
  assert.deepEqual([b.dataPrelievo, b.dataEsame], ['2025-04-28', '2025-04-28']);

  // Nel testo, senza etichetta separata.
  const c = extractReport(await lines([{ x: 50, y: 800, text: 'Campione prelevato il 15/01/2025 alle 8:10' }, ...base]));
  assert.equal(c.dataPrelievo, '2025-01-15');
});

test('analisi senza intestazione: riconosce le righe "nome | valore | unità | riferimento"', async () => {
  const r = extractReport(
    await lines([
      { x: 50, y: 800, text: 'Creatinina' },
      { x: 220, y: 800, text: '0,91' },
      { x: 300, y: 800, text: 'mg/dL' },
      { x: 400, y: 800, text: '0,50 - 1,20' },
      { x: 50, y: 785, text: 'Colesterolo totale' },
      { x: 220, y: 785, text: '245' },
      { x: 300, y: 785, text: 'mg/dL' },
      { x: 400, y: 785, text: '< 200' },
      { x: 50, y: 770, text: 'Sodio' },
      { x: 220, y: 770, text: '140' },
      { x: 300, y: 770, text: 'mmol/L' },
      { x: 400, y: 770, text: '135 - 145' },
    ]),
  );
  assert.equal(r.tipo, 'laboratorio');
  assert.deepEqual(
    r.risultati.map((x) => [x.nome, x.numero, x.unita, x.fuoriRange]),
    [
      ['Creatinina', 0.91, 'mg/dL', false],
      ['Colesterolo totale', 245, 'mg/dL', true],
      ['Sodio', 140, 'mmol/L', false],
    ],
  );
});

test('unità e intervallo di riferimento nella stessa cella vengono separati', async () => {
  // Con intestazione: l'intervallo segue l'unità dopo un solo spazio, o cade sotto la colonna "Unità".
  const a = extractReport(
    await lines([
      { x: 50, y: 760, text: 'Esame' },
      { x: 250, y: 760, text: 'Risultato' },
      { x: 330, y: 760, text: 'Unità' },
      { x: 460, y: 760, text: 'Valori di riferimento' },
      { x: 50, y: 740, text: 'Eritrociti' },
      { x: 250, y: 740, text: '4,80' },
      { x: 330, y: 740, text: 'x10^6/uL 4,00 - 6,00' },
      { x: 50, y: 725, text: 'Leucociti' },
      { x: 250, y: 725, text: '12,4' },
      { x: 330, y: 725, text: 'x10^3/uL' },
      { x: 400, y: 725, text: '4,00 - 10,00' },
      { x: 50, y: 710, text: 'Glucosio' },
      { x: 250, y: 710, text: '90' },
      { x: 330, y: 710, text: 'mg/dL' },
      { x: 460, y: 710, text: '70 - 100' },
      { x: 50, y: 695, text: 'Filtrato glomerulare' },
      { x: 250, y: 695, text: '95' },
      { x: 330, y: 695, text: 'mL/min/1.73m2 > 90' },
    ]),
  );
  assert.deepEqual(
    a.risultati.map((x) => [x.nome, x.unita, x.riferimento, x.fuoriRange]),
    [
      ['Eritrociti', 'x10^6/uL', '4,00 - 6,00', false],
      ['Leucociti', 'x10^3/uL', '4,00 - 10,00', true],
      ['Glucosio', 'mg/dL', '70 - 100', false],
      ['Filtrato glomerulare', 'mL/min/1.73m2', '> 90', false],
    ],
  );

  // Senza intestazione.
  const b = extractReport(
    await lines([
      { x: 50, y: 800, text: 'Eritrociti' },
      { x: 220, y: 800, text: '4,80' },
      { x: 300, y: 800, text: 'x10^6/uL 4,00 - 6,00' },
      { x: 50, y: 785, text: 'Creatinina' },
      { x: 220, y: 785, text: '1,50' },
      { x: 300, y: 785, text: 'mg/dL 0,50 - 1,20' },
      { x: 50, y: 770, text: 'Sodio' },
      { x: 220, y: 770, text: '140' },
      { x: 300, y: 770, text: 'mmol/L' },
      { x: 400, y: 770, text: '135 - 145' },
    ]),
  );
  assert.deepEqual(
    b.risultati.map((x) => [x.nome, x.unita, x.riferimento, x.fuoriRange]),
    [
      ['Eritrociti', 'x10^6/uL', '4,00 - 6,00', false],
      ['Creatinina', 'mg/dL', '0,50 - 1,20', true],
      ['Sodio', 'mmol/L', '135 - 145', false],
    ],
  );
});

test('il formato dei referti anonimizzati si rilegge uguale', async () => {
  const doc = await extractPdf(makePdf([[{ x: 31, y: 700, text: 'Data esame:' }, { x: 121, y: 700, text: '14.03.2024' }]]));
  const original = buildLines(doc);
  const back = parseLayoutText(formatLayout(original, { pages: doc.pages }));
  assert.deepEqual(back.map((l) => l.cells.map((c) => [Math.round(c.x), c.text])), original.map((l) => l.cells.map((c) => [Math.round(c.x), c.text])));
  assert.equal(extractReport(back).dataEsame, '2024-03-14');
});

test('unità di misura mostrate con esponenti e simbolo micro', () => {
  const cases: [string, string][] = [
    ['x10^6/uL', '×10⁶/μL'],
    ['x 10^3/µL', '×10³/μL'],
    ['10*3/uL', '10³/μL'],
    ['10E9/L', '10⁹/L'],
    ['mL/min/1.73m2', 'mL/min/1,73 m²'],
    ['mL/min/1,73 m^2', 'mL/min/1,73 m²'],
    ['/mmc', '/mm³'],
    ['ug/dL', 'μg/dL'],
    ['umol/L', 'μmol/L'],
    ['uUI/mL', 'μUI/mL'],
    // Invariate: unità enzimatiche e testo normale.
    ['U/L', 'U/L'],
    ['UI/mL', 'UI/mL'],
    ['ui/ml', 'ui/ml'],
    ['mg/dL', 'mg/dL'],
    ['mmol/L', 'mmol/L'],
    ['%', '%'],
    ['mm/h', 'mm/h'],
    ['unità', 'unità'],
  ];
  for (const [input, expected] of cases) assert.equal(formatUnit(input), expected, input);
});
