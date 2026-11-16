import type { SyncResponseDTO } from '@alby/shared';
import { ApiError, apiDownload, apiRequest } from './api';
import { getDb, getMeta, wipeLocalData } from './db';

/**
 * Sincronizzazione con il server (vedi `SyncResponseDTO` in @alby/shared):
 * 1. si chiedono le modifiche dall'ultimo cursore;
 * 2. si applicano in un'unica transazione (tutto o niente: un'interruzione non lascia dati a metà);
 * 3. si scaricano i documenti mancanti, uno alla volta. Se uno non arriva, si riprova alla prossima.
 */

export interface SyncAccount {
  server: string;
  token: string;
  userId: string;
}

export interface SyncOutcome {
  /** Documenti ancora da scaricare (errore di rete a metà, o file non disponibile): si riprova alla prossima. */
  pendingFiles: number;
}

const sortKey = (p: { lastName: string; firstName: string }) =>
  `${p.lastName} ${p.firstName}`.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** Il database locale appartiene a questo utente su questo server? Altrimenti si riparte da zero. */
async function ensureOwner(account: SyncAccount) {
  const owner = await getMeta('owner');
  const expected = `${account.userId}@${account.server}`;
  if (owner !== null && owner !== expected) await wipeLocalData();
  return expected;
}

async function applyChanges(data: SyncResponseDTO, owner: string) {
  const db = await getDb();
  await db.withExclusiveTransactionAsync(async (txn) => {
    if (data.full) {
      await txn.execAsync('DELETE FROM reports; DELETE FROM medications;');
    } else {
      for (const id of data.fullPatientIds) {
        await txn.runAsync('DELETE FROM reports WHERE patientId = ?', id);
        await txn.runAsync('DELETE FROM medications WHERE patientId = ?', id);
      }
    }

    // Pazienti e tipi di referto arrivano sempre completi.
    await txn.execAsync('DELETE FROM patients; DELETE FROM templates;');
    for (const p of data.patients) {
      await txn.runAsync('INSERT INTO patients (id, sortKey, json) VALUES (?, ?, ?)', p.id, sortKey(p), JSON.stringify(p));
    }
    for (const t of data.templates) {
      await txn.runAsync('INSERT INTO templates (id, json) VALUES (?, ?)', t.id, JSON.stringify(t));
    }

    for (const r of data.reports) {
      await txn.runAsync(
        'INSERT OR REPLACE INTO reports (id, patientId, examDate, fileId, json) VALUES (?, ?, ?, ?, ?)',
        r.id,
        r.patientId,
        r.examDate,
        r.file?.id ?? null,
        JSON.stringify(r),
      );
    }
    for (const m of data.medications) {
      await txn.runAsync('INSERT OR REPLACE INTO medications (id, patientId, json) VALUES (?, ?, ?)', m.id, m.patientId, JSON.stringify(m));
    }
    for (const id of data.deleted.reports) await txn.runAsync('DELETE FROM reports WHERE id = ?', id);
    for (const id of data.deleted.medications) await txn.runAsync('DELETE FROM medications WHERE id = ?', id);

    // Pazienti non più accessibili (accesso revocato o paziente eliminato): via tutto.
    await txn.execAsync(`
      DELETE FROM reports WHERE patientId NOT IN (SELECT id FROM patients);
      DELETE FROM medications WHERE patientId NOT IN (SELECT id FROM patients);
      DELETE FROM files WHERE id NOT IN (SELECT fileId FROM reports WHERE fileId IS NOT NULL);
    `);

    await txn.runAsync('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', 'owner', owner);
    await txn.runAsync('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', 'cursor', data.cursor);
    await txn.runAsync('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', 'syncedAt', new Date().toISOString());
  });
}

const MISSING_FILES = `
  FROM reports r LEFT JOIN files f ON f.id = r.fileId
  WHERE r.fileId IS NOT NULL AND f.id IS NULL`;

async function countMissingFiles(): Promise<number> {
  const db = await getDb();
  return (await db.getFirstAsync<{ n: number }>(`SELECT count(*) AS n ${MISSING_FILES}`))?.n ?? 0;
}

async function downloadMissingFiles(account: SyncAccount): Promise<void> {
  const db = await getDb();
  const missing = await db.getAllAsync<{ fileId: string; patientId: string; json: string }>(
    `SELECT r.fileId, r.patientId, r.json ${MISSING_FILES}`,
  );
  for (const row of missing) {
    let data: Uint8Array;
    try {
      data = await apiDownload(account.server, `/files/${row.fileId}`, account.token);
    } catch (err) {
      if (err instanceof ApiError && (err.offline || err.status === 401)) throw err;
      continue; // File non disponibile (es. eliminato nel frattempo): si riprova alla prossima sincronizzazione.
    }
    const mimeType = (JSON.parse(row.json) as SyncResponseDTO['reports'][number]).file?.mimeType ?? 'application/pdf';
    // Il referto potrebbe essere stato eliminato durante il download: si salva solo se è ancora lì.
    await db.runAsync(
      `INSERT OR REPLACE INTO files (id, patientId, mimeType, size, data)
       SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM reports WHERE fileId = ?)`,
      row.fileId,
      row.patientId,
      mimeType,
      data.byteLength,
      data,
      row.fileId,
    );
  }
}

/** Una sincronizzazione completa del ciclo: modifiche, poi documenti. */
export async function synchronize(account: SyncAccount): Promise<SyncOutcome> {
  const owner = await ensureOwner(account);
  const cursor = await getMeta('cursor');
  const query = cursor ? `?since=${encodeURIComponent(cursor)}` : '';
  const data = await apiRequest<SyncResponseDTO>(account.server, `/sync${query}`, { token: account.token });
  await applyChanges(data, owner);
  try {
    await downloadMissingFiles(account);
  } catch (err) {
    // Rete caduta durante i download: i dati sono aggiornati, i documenti arriveranno alla prossima.
    if (err instanceof ApiError && err.status === 401) throw err;
  }
  return { pendingFiles: await countMissingFiles() };
}
