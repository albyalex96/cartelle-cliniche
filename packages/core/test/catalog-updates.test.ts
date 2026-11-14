/** Programmazione dell'aggiornamento automatico degli elenchi pubblici. Non usa il database. */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { nextAutoUpdateAt } from '../src/catalog-updates';

// Date in ora locale del server, come l'ora scelta nelle impostazioni.
const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min);

describe('aggiornamento automatico degli elenchi', () => {
  test('N giorni dopo l’ultimo aggiornamento, all’ora scelta', () => {
    const next = nextAutoUpdateAt({ days: 7, hour: 3, importedAt: at(2026, 11, 1, 15, 30), lastAttempt: null, now: at(2026, 11, 2) });
    assert.deepEqual(next, at(2026, 11, 8, 3));
  });

  test('mai scaricato: oggi all’ora scelta (subito, se è già passata)', () => {
    assert.deepEqual(nextAutoUpdateAt({ days: 7, hour: 3, importedAt: null, lastAttempt: null, now: at(2026, 11, 14, 1) }), at(2026, 11, 14, 3));
    assert.deepEqual(nextAutoUpdateAt({ days: 7, hour: 3, importedAt: null, lastAttempt: null, now: at(2026, 11, 14, 10) }), at(2026, 11, 14, 3));
  });

  test('tentativo non riuscito: si riprova il giorno dopo alla stessa ora', () => {
    const lastAttempt = { at: at(2026, 11, 8, 3, 1).toISOString(), error: 'Il sito AIFA ha risposto con un errore (503)' };
    const next = nextAutoUpdateAt({ days: 7, hour: 3, importedAt: at(2026, 11, 1, 15), lastAttempt, now: at(2026, 11, 8, 4) });
    assert.deepEqual(next, at(2026, 11, 9, 3));
  });

  test('un errore vecchio, seguito da un aggiornamento riuscito, non conta più', () => {
    const lastAttempt = { at: at(2026, 11, 1, 3).toISOString(), error: 'errore' };
    const next = nextAutoUpdateAt({ days: 1, hour: 3, importedAt: at(2026, 11, 1, 12), lastAttempt, now: at(2026, 11, 1, 13) });
    assert.deepEqual(next, at(2026, 11, 2, 3));
  });
});
