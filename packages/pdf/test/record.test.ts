import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildLines, extractPdf, renderRecordPdf } from '../src';

// Tutti i dati qui sotto sono INVENTATI.
test('PDF della cartella clinica: intestazione, sezioni, campi, testo, tabella su più pagine', async () => {
  const pdf = await renderRecordPdf({
    patientName: 'Niccolò D’Èsempio',
    subtitle: 'Dal 01/01/2024 al 31/12/2024 · Stampata il 14/11/2026',
    sections: [
      { title: 'Dati anagrafici', blocks: [{ type: 'fields', items: [{ label: 'Codice fiscale', value: 'SMPNCC58S03Z999X' }] }] },
      {
        title: 'Referti',
        blocks: [
          { type: 'heading', text: 'Emocromo', sub: '14/03/2024 · Laboratorio Analisi' },
          { type: 'text', label: 'Note', text: 'Prima riga\n\nSeconda riga → freccia' },
          {
            type: 'table',
            label: 'Valori',
            columns: [
              { title: 'Esame', width: 0.4 },
              { title: 'Valore', width: 0.2 },
              { title: 'Riferimento', width: 0.4 },
            ],
            rows: [
              { cells: ['Emocromo'], group: true },
              { cells: ['Emoglobina', '13,8', '13 - 17'] },
              { cells: ['Ferritina', '450', '30 - 400'], flagged: true },
              ...Array.from({ length: 80 }, (_, i) => ({ cells: [`Esame di prova ${i + 1}`, '1', ''] })),
            ],
          },
          { type: 'heading', text: 'Visita cardiologica', sub: '20/05/2024' },
        ],
      },
      { title: 'Immagini', blocks: [{ type: 'note', text: 'Nessuno studio di immagini nel periodo.' }] },
    ],
  });
  const doc = await extractPdf(pdf);
  const text = buildLines(doc).map((l) => l.text);
  assert.ok(doc.pages.length > 1, 'una tabella lunga continua su più pagine');
  assert.deepEqual(text.slice(0, 4), ['Cartella clinica', 'Niccolò D’Èsempio', 'Dal 01/01/2024 al 31/12/2024 · Stampata il 14/11/2026', 'Dati anagrafici']);
  assert.ok(text.includes('Codice fiscale | SMPNCC58S03Z999X'));
  assert.ok(text.includes('Emocromo'));
  assert.ok(text.includes('14/03/2024 · Laboratorio Analisi'));
  assert.ok(text.includes('Prima riga'));
  assert.ok(text.includes('Seconda riga ? freccia'), 'carattere sconosciuto al font sostituito');
  assert.ok(text.includes('Emoglobina | 13,8 | 13 - 17'));
  assert.ok(text.includes('Esame di prova 80 | 1 | —'));
  // L'intestazione della tabella si ripete sulla pagina nuova.
  assert.ok(text.filter((t) => t === 'Esame | Valore | Riferimento').length > 1);
  assert.ok(text.includes('Visita cardiologica'));
  assert.ok(text.includes('Nessuno studio di immagini nel periodo.'));
  assert.ok(text.some((t) => t.includes(`Pagina ${doc.pages.length} di ${doc.pages.length}`)));
});
