import assert from 'node:assert/strict';
import { test } from 'node:test';
import { anonymizeLines, buildLines, collectNames, extractPdf, formatLayout, NoTextLayerError } from '../src';
import { makePdf } from '../src/testing';

// Referto INVENTATO: nomi, codice fiscale e valori sono di fantasia.
const REFERTO = makePdf([
  [
    { x: 50, y: 800, text: 'LABORATORIO ANALISI SAN FANTASIA', size: 14 },
    { x: 50, y: 780, text: 'Via delle Prove 12, Roma' },
    { x: 50, y: 750, text: 'Paziente: CAIO GIUSEPPINA' },
    { x: 350, y: 750, text: 'Data di nascita:' },
    { x: 440, y: 750, text: '07/04/1961' },
    { x: 50, y: 735, text: 'Codice fiscale:' },
    { x: 140, y: 735, text: 'CAIGPP61D47Z999Z' },
    { x: 350, y: 735, text: 'Tel. 333 1234567' },
    { x: 50, y: 720, text: 'Medico richiedente: Dott. Bruno Calpurni' },
    { x: 50, y: 690, text: 'Nome esame' },
    { x: 250, y: 690, text: 'Risultato' },
    { x: 350, y: 690, text: 'Unita' },
    { x: 430, y: 690, text: 'Valori di riferimento' },
    { x: 50, y: 672, text: 'Emoglobina' },
    { x: 250, y: 672, text: '13,8' },
    { x: 350, y: 672, text: 'g/dL' },
    { x: 430, y: 672, text: '12,0 - 16,0' },
    { x: 50, y: 657, text: 'Glucosio' },
    { x: 250, y: 657, text: '92' },
    { x: 350, y: 657, text: 'mg/dL' },
    { x: 430, y: 657, text: '70 - 100' },
    { x: 50, y: 600, text: 'La sig.ra Caio deve ripetere l esame. Referto firmato da Dott.ssa Elena Neri' },
  ],
]);

test('estrae righe e colonne dal PDF', async () => {
  const doc = await extractPdf(REFERTO);
  const lines = buildLines(doc);
  const emo = lines.find((l) => l.text.startsWith('Emoglobina'));
  assert.ok(emo, 'riga emoglobina trovata');
  assert.deepEqual(emo.cells.map((c) => c.text), ['Emoglobina', '13,8', 'g/dL', '12,0 - 16,0']);
  assert.ok(lines[0]!.top < lines.at(-1)!.top, 'righe ordinate dall’alto');
});

test('anonimizza: niente dati personali, struttura intatta', async () => {
  const doc = await extractPdf(REFERTO);
  const { lines, stats } = anonymizeLines(buildLines(doc), { names: ['Elena Neri'] });
  const text = formatLayout(lines, { pages: doc.pages });

  for (const secret of ['CAIO', 'Caio', 'GIUSEPPINA', 'CAIGPP61D47Z999Z', '333 1234567', 'Calpurni', 'Bruno', 'Neri', 'Elena', '07/04/1961', 'Prove 12', '13,8', '92 ']) {
    assert.ok(!text.includes(secret), `"${secret}" non deve comparire`);
  }
  // La struttura resta leggibile: intestazioni, nomi dei parametri, unità, formato dei numeri.
  for (const kept of ['LABORATORIO ANALISI SAN FANTASIA', 'Nome esame', 'Risultato', 'Valori di riferimento', 'Emoglobina', 'Glucosio', 'g/dL', 'mg/dL', 'Dott.']) {
    assert.ok(text.includes(kept), `"${kept}" deve restare`);
  }
  const emo = lines.find((l) => l.text.startsWith('Emoglobina'))!;
  assert.match(emo.cells[1]!.text, /^\d\d,\d$/, 'il valore mantiene il formato');
  assert.match(emo.cells[3]!.text, /^\d\d,\d - \d\d,\d$/, 'l’intervallo mantiene il formato');
  assert.ok(stats.codiciFiscali + stats.campiPersonali > 0 && stats.nomi > 0 && stats.cifreRimescolate > 0);
  assert.ok(text.includes('sig.ra [NOME] deve'), 'spaziatura conservata dopo il nome oscurato');
});

test('intestazione a tabella: valori anagrafici nella riga sotto, in colonna', async () => {
  const pdf = makePdf([
    [
      { x: 50, y: 800, text: 'Cognome' },
      { x: 180, y: 800, text: 'Nome' },
      { x: 300, y: 800, text: 'Data di nascita' },
      { x: 450, y: 800, text: 'Sesso' },
      { x: 50, y: 786, text: 'BIANCOLINI' },
      { x: 180, y: 786, text: 'ORSOLA' },
      { x: 300, y: 786, text: '12/09/1977' },
      { x: 450, y: 786, text: 'F' },
      { x: 50, y: 740, text: 'Esame' },
      { x: 250, y: 740, text: 'Esito' },
      { x: 50, y: 725, text: 'Creatinina' },
      { x: 250, y: 725, text: '0,91 mg/dL' },
      { x: 50, y: 650, text: 'Copia per Orsola Biancolini' },
    ],
  ]);
  const doc = await extractPdf(pdf);
  const text = formatLayout(anonymizeLines(buildLines(doc)).lines, { pages: doc.pages });
  for (const secret of ['BIANCOLINI', 'Biancolini', 'ORSOLA', 'Orsola', '12/09/1977']) {
    assert.ok(!text.includes(secret), `"${secret}" non deve comparire`);
  }
  for (const kept of ['Cognome', 'Data di nascita', 'Esame', 'Creatinina', 'mg/dL', 'Copia per']) {
    assert.ok(text.includes(kept), `"${kept}" deve restare`);
  }
});

test('nomi trovati in un referto vengono oscurati anche in un altro', async () => {
  const conEtichetta = buildLines(await extractPdf(makePdf([[{ x: 50, y: 800, text: 'Paziente: Ettore Quaglierini' }]])));
  const senzaEtichetta = buildLines(await extractPdf(makePdf([[{ x: 50, y: 800, text: 'QUAGLIERINI ETTORE - Emocromo' }]])));
  const names = collectNames(conEtichetta);
  const out = anonymizeLines(senzaEtichetta, { names }).lines.map((l) => l.text).join('\n');
  assert.ok(!/quaglierini|ettore/i.test(out), out);
  assert.ok(out.includes('Emocromo'));
});

test('nomi dei medici: titoli in maiuscolo, attaccati, firme e qualifiche', async () => {
  const pdf = makePdf([
    [
      { x: 50, y: 800, text: 'DOTT. CARPANETO SILVIO' },
      { x: 50, y: 785, text: 'Dott.ssa LOMBARDINI Teresa - Emocromo' },
      { x: 50, y: 770, text: 'Validato da Dr.Fumagalli' },
      { x: 50, y: 755, text: 'Firmato digitalmente da: Sbarbaro Clelia' },
      { x: 50, y: 740, text: 'Il Direttore Sanitario' },
      { x: 250, y: 740, text: 'Tagliaferri Osvaldo' },
      { x: 50, y: 725, text: 'Responsabile:' },
      { x: 150, y: 725, text: 'Prof. Ghezzi' },
      { x: 50, y: 700, text: 'Copia per Carpaneto, controllo Dottorato e Glucosio' },
      { x: 50, y: 680, text: 'RM LOMBARE (SENZA CONTRASTO) ( TSRM: Pellegrinetti Ada eseguito il 01.02.2023 10:15)' },
    ],
  ]);
  const out = anonymizeLines(buildLines(await extractPdf(pdf))).lines.map((l) => l.text).join('\n');
  for (const secret of ['CARPANETO', 'Carpaneto', 'SILVIO', 'LOMBARDINI', 'Teresa', 'Fumagalli', 'Sbarbaro', 'Clelia', 'Tagliaferri', 'Osvaldo', 'Ghezzi', 'Pellegrinetti', 'Ada ']) {
    assert.ok(!out.includes(secret), `"${secret}" non deve comparire:\n${out}`);
  }
  for (const kept of ['DOTT.', 'Dott.ssa', 'Emocromo', 'Validato da', 'Firmato digitalmente da', 'Il Direttore Sanitario', 'Dottorato', 'Glucosio', 'RM LOMBARE', 'TSRM: [NOME]', 'eseguito il']) {
    assert.ok(out.includes(kept), `"${kept}" deve restare:\n${out}`);
  }
});

test('più etichette con ":" sulla stessa riga: il valore è accanto, non sotto', async () => {
  const pdf = makePdf([
    [
      { x: 30, y: 800, text: 'Indirizzo:' },
      { x: 120, y: 800, text: 'Via Garibaldi 7, 12 - LECCE' },
      { x: 380, y: 800, text: 'Sesso:' },
      { x: 450, y: 800, text: 'F' },
      { x: 30, y: 785, text: 'Reparto:' },
      { x: 120, y: 785, text: 'Esterni' },
    ],
  ]);
  const out = anonymizeLines(buildLines(await extractPdf(pdf))).lines.map((l) => l.text).join('\n');
  assert.ok(!/garibaldi|lecce/i.test(out), out);
  assert.ok(out.includes('Reparto:') && out.includes('Esterni'), `la riga sotto resta leggibile:\n${out}`);
});

test('PDF senza testo (scansione) → errore chiaro', async () => {
  await assert.rejects(() => extractPdf(makePdf([[]])), NoTextLayerError);
});
