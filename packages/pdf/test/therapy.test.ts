import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildLines, extractPdf, renderTherapyPdf } from '../src';

// Tutti i dati qui sotto sono INVENTATI.
test('PDF delle terapie in corso: intestazione, tabella, accenti, più pagine', async () => {
  const pdf = await renderTherapyPdf({
    patientName: 'Niccolò D’Èsempio',
    birthDate: '03/11/1958',
    printedOn: '12/11/2026',
    items: [
      { name: 'Provamax 20 mg compresse', activeIngredient: 'Provamaxolo', dosage: '1 compressa', frequency: 'Mattina e sera' },
      { name: 'Sciroppix', strength: '120 mg/5 ml', form: 'Sciroppo', activeIngredient: 'Sciroppolo', dosage: '5 ml', frequency: 'Ogni 8 ore' },
      { name: 'Finticina → gocce', dosage: null, frequency: null, asNeeded: true },
      ...Array.from({ length: 60 }, (_, i) => ({ name: `Farmaco di prova ${i + 1}`, frequency: 'Una volta al giorno' })),
    ],
  });
  const doc = await extractPdf(pdf);
  const text = buildLines(doc).map((l) => l.text);
  assert.ok(doc.pages.length > 1, 'un elenco lungo continua su più pagine');
  assert.deepEqual(text.slice(0, 4), ['Terapie in corso', 'Niccolò D’Èsempio', 'Nato/a il 03/11/1958 · Elenco aggiornato al 12/11/2026', 'Farmaco | Dose | Frequenza']);
  assert.ok(text.includes('Provamax 20 mg compresse | 1 compressa | Mattina e sera'));
  assert.ok(text.includes('Provamaxolo'));
  // Dosaggio accanto al nome, formulazione sotto insieme al principio attivo.
  assert.ok(text.includes('Sciroppix 120 mg/5 ml | 5 ml | Ogni 8 ore'));
  assert.ok(text.includes('Sciroppo · Sciroppolo'));
  // Un carattere che il font non ha diventa "?", senza errori; "al bisogno" è indicato.
  assert.ok(text.includes('Finticina ? gocce | — | Al bisogno'));
  assert.ok(text.includes('Farmaco di prova 60 | — | Una volta al giorno'));
  assert.equal(text.at(-1), `Pagina ${doc.pages.length} di ${doc.pages.length}`);

  const empty = await renderTherapyPdf({ patientName: 'Anna Bianchi', printedOn: '12/11/2026', items: [] });
  assert.ok(buildLines(await extractPdf(empty)).some((l) => l.text === 'Nessuna terapia in corso.'));
});
