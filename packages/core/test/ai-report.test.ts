/** Lettura della risposta di un assistente IA (referto trascritto da una foto). Non usa il database. */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { AI_REPORT_PROMPT, parseAiReport, reportInputSchema } from '@alby/shared';

const lab = {
  kind: 'laboratorio',
  title: 'Esami del sangue',
  examDate: '03/05/2025',
  samplingDate: '2025-05-02',
  reportDate: null,
  reportNumber: 12345,
  facility: 'Laboratorio Inventato',
  doctor: null,
  body: null,
  results: [
    { section: 'Emocromo', name: 'Emoglobina', value: '13,8', unit: 'g/dL', referenceRange: '12,0 - 16,0', outOfRange: false },
    { section: 'Emocromo', name: 'Leucociti', value: 11.2, unit: null, referenceRange: null, outOfRange: 'forse' },
    { name: 'Riga senza valore' },
    'non è una riga',
  ],
  warnings: ['Timbro sopra la firma', 7],
};

describe('referto da assistente IA', () => {
  test('risposta in un blocco di codice, con testo attorno', () => {
    const r = parseAiReport(`Ecco il referto:\n\`\`\`json\n${JSON.stringify(lab, null, 2)}\n\`\`\`\nFammi sapere!`);
    assert.ok(r.ok);
    assert.equal(r.kind, 'LABORATORIO');
    assert.equal(r.values.examDate, '2025-05-03', 'data italiana convertita');
    assert.equal(r.values.reportNumber, '12345');
    assert.deepEqual([r.values.reportDate, r.values.doctor, r.values.doctorRole, r.values.notes], ['', '', '', '']);
    assert.deepEqual(r.values.results, [
      { section: 'Emocromo', name: 'Emoglobina', value: '13,8', unit: 'g/dL', referenceRange: '12,0 - 16,0', outOfRange: false },
      { section: 'Emocromo', name: 'Leucociti', value: '11,2', unit: '', referenceRange: '', outOfRange: null },
    ]);
    assert.deepEqual(r.warnings, ['2 righe senza nome o valore sono state scartate.', 'Timbro sopra la firma']);
    // Il risultato è accettato dal form così com'è.
    assert.ok(reportInputSchema.safeParse(r.values).success);
  });

  test('referto descrittivo, JSON senza blocco di codice, più referti', () => {
    const one = { title: 'RM ginocchio', examDate: 'ieri', body: 'Primo paragrafo.\n\nSecondo paragrafo.', results: [] };
    const r = parseAiReport(JSON.stringify([one, one]));
    assert.ok(r.ok);
    assert.equal(r.kind, 'DESCRITTIVO', 'tipo dedotto se manca');
    assert.equal(r.values.examDate, '');
    assert.equal(r.values.body, 'Primo paragrafo.\n\nSecondo paragrafo.');
    assert.equal(r.warnings.length, 2);
    assert.match(r.warnings[0]!, /2 referti/);
    assert.match(r.warnings[1]!, /data dell’esame/);
  });

  test('testo che non è una risposta valida', () => {
    for (const bad of ['', '   ', 'Mi dispiace, non riesco a leggere la foto.', '{ "kind": "LABORATORIO", ', '{"kind":"ALTRO","title":"x"}', '{}', '42', 'x'.repeat(200_001)]) {
      const r = parseAiReport(bad);
      assert.equal(r.ok, false, bad.slice(0, 40));
    }
  });

  test('il prompt descrive tutti i campi letti', () => {
    for (const field of ['kind', 'title', 'examDate', 'samplingDate', 'reportDate', 'reportNumber', 'facility', 'doctor', 'doctorRole', 'body', 'results', 'section', 'referenceRange', 'outOfRange', 'warnings']) {
      assert.ok(AI_REPORT_PROMPT.includes(`"${field}"`), field);
    }
  });
});
