import type { SyncImagingStudyDTO, SyncResponseDTO } from '@alby/shared';
import { ApiError, apiDownload, apiRequest } from './api';
import { dropUnusedLeaflets, downloadTherapyLeaflets, refreshCatalogs, therapyLeafletCodes } from './catalog';
import { getDb, getMeta, wipeLocalData } from './db';
import { countOutbox, flushOutbox } from './outbox';

/**
 * Sincronizzazione con il server (vedi `SyncResponseDTO` in @alby/shared):
 * 0. si inviano i nuovi referti salvati offline (outbox.ts);
 * 1. si chiedono le modifiche dall'ultimo cursore;
 * 2. si applicano in un'unica transazione (tutto o niente: un'interruzione non lascia dati a metà);
 * 3. si scaricano i documenti e le immagini mancanti, uno alla volta. Se uno non arriva, si riprova alla prossima;
 * 4. poi i foglietti illustrativi dei farmaci in terapia e, se cambiati sul server, i cataloghi (catalog.ts).
 */

export interface SyncAccount {
  server: string;
  token: string;
  userId: string;
}

export interface SyncOutcome {
  /** Documenti e immagini ancora da scaricare (rete caduta a metà, o file non disponibile): si riprova alla prossima. */
  pendingFiles: number;
  /** Nuovi referti salvati sul telefono e non ancora inviati (o rifiutati dal server). */
  pendingReports: number;
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
  // Stessa connessione (con la chiave): vedi la nota in db.ts.
  await db.withTransactionAsync(async () => {
    const leafletsBefore = await therapyLeafletCodes(db);
    if (data.full) {
      await db.execAsync('DELETE FROM reports; DELETE FROM medications; DELETE FROM imaging_studies;');
    } else {
      for (const id of data.fullPatientIds) {
        await db.runAsync('DELETE FROM reports WHERE patientId = ?', id);
        await db.runAsync('DELETE FROM medications WHERE patientId = ?', id);
        await db.runAsync('DELETE FROM imaging_studies WHERE patientId = ?', id);
      }
    }

    // Pazienti e tipi di referto arrivano sempre completi.
    await db.execAsync('DELETE FROM patients; DELETE FROM templates;');
    for (const p of data.patients) {
      await db.runAsync('INSERT INTO patients (id, sortKey, json) VALUES (?, ?, ?)', p.id, sortKey(p), JSON.stringify(p));
    }
    for (const t of data.templates) {
      await db.runAsync('INSERT INTO templates (id, json) VALUES (?, ?)', t.id, JSON.stringify(t));
    }

    for (const r of data.reports) {
      await db.runAsync(
        'INSERT OR REPLACE INTO reports (id, patientId, examDate, fileId, json) VALUES (?, ?, ?, ?, ?)',
        r.id,
        r.patientId,
        r.examDate,
        r.file?.id ?? null,
        JSON.stringify(r),
      );
    }
    for (const m of data.medications) {
      await db.runAsync('INSERT OR REPLACE INTO medications (id, patientId, json) VALUES (?, ?, ?)', m.id, m.patientId, JSON.stringify(m));
    }
    for (const id of data.deleted.reports) await db.runAsync('DELETE FROM reports WHERE id = ?', id);
    for (const id of data.deleted.medications) await db.runAsync('DELETE FROM medications WHERE id = ?', id);

    // Immagini: solo gli studi collegati a un referto; un collegamento tolto le toglie dal telefono.
    for (const st of data.imaging) {
      if (st.reportId) {
        await db.runAsync(
          'INSERT OR REPLACE INTO imaging_studies (id, patientId, reportId, json) VALUES (?, ?, ?, ?)',
          st.id,
          st.patientId,
          st.reportId,
          JSON.stringify(st),
        );
      } else {
        await db.runAsync('DELETE FROM imaging_studies WHERE id = ?', st.id);
      }
    }
    for (const id of data.deleted.imagingStudies) await db.runAsync('DELETE FROM imaging_studies WHERE id = ?', id);

    // Pazienti non più accessibili (accesso revocato o paziente eliminato): via tutto.
    await db.execAsync(`
      DELETE FROM reports WHERE patientId NOT IN (SELECT id FROM patients);
      DELETE FROM medications WHERE patientId NOT IN (SELECT id FROM patients);
      DELETE FROM files WHERE id NOT IN (SELECT fileId FROM reports WHERE fileId IS NOT NULL);
      DELETE FROM imaging_studies WHERE reportId NOT IN (SELECT id FROM reports);
      DELETE FROM images WHERE studyId NOT IN (SELECT id FROM imaging_studies);
    `);
    await dropUnusedLeaflets(db, leafletsBefore);

    await db.runAsync('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', 'owner', owner);
    await db.runAsync('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', 'cursor', data.cursor);
    await db.runAsync('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', 'syncedAt', new Date().toISOString());
  });
}

const MISSING_FILES = `
  FROM reports r LEFT JOIN files f ON f.id = r.fileId
  WHERE r.fileId IS NOT NULL AND f.id IS NULL`;

/** Immagini degli studi salvati non ancora scaricate (con lo studio a cui appartengono). */
async function missingImages(): Promise<{ instanceId: string; studyId: string }[]> {
  const db = await getDb();
  const studies = await db.getAllAsync<{ id: string; json: string }>('SELECT id, json FROM imaging_studies');
  const have = new Set((await db.getAllAsync<{ instanceId: string }>('SELECT instanceId FROM images')).map((r) => r.instanceId));
  return studies.flatMap((st) =>
    (JSON.parse(st.json) as SyncImagingStudyDTO).series
      .flatMap((se) => se.instances)
      .filter((i) => !have.has(i.id))
      .map((i) => ({ instanceId: i.id, studyId: st.id })),
  );
}

async function countMissing(): Promise<number> {
  const db = await getDb();
  const files = (await db.getFirstAsync<{ n: number }>(`SELECT count(*) AS n ${MISSING_FILES}`))?.n ?? 0;
  return files + (await missingImages()).length;
}

async function downloadMissingImages(account: SyncAccount): Promise<void> {
  const db = await getDb();
  for (const { instanceId, studyId } of await missingImages()) {
    let res: { data: Uint8Array; mimeType: string };
    try {
      res = await apiDownload(account.server, `/images/${instanceId}`, account.token);
    } catch (err) {
      if (err instanceof ApiError && (err.offline || err.status === 401)) throw err;
      continue; // Formato senza anteprima o immagine eliminata: si riprova alla prossima.
    }
    await db.runAsync(
      `INSERT OR REPLACE INTO images (instanceId, studyId, mimeType, data)
       SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM imaging_studies WHERE id = ?)`,
      instanceId,
      studyId,
      res.mimeType,
      res.data,
      studyId,
    );
  }
}

async function downloadMissingFiles(account: SyncAccount): Promise<void> {
  const db = await getDb();
  const missing = await db.getAllAsync<{ fileId: string; patientId: string; json: string }>(
    `SELECT r.fileId, r.patientId, r.json ${MISSING_FILES}`,
  );
  for (const row of missing) {
    let data: Uint8Array;
    try {
      data = (await apiDownload(account.server, `/files/${row.fileId}`, account.token)).data;
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
  // Prima i referti salvati offline: così tornano già in questa sincronizzazione.
  try {
    await flushOutbox(account.server, account.token);
  } catch (err) {
    // Rete caduta o server in difficoltà: restano in coda per la prossima volta.
    if (err instanceof ApiError && err.status === 401) throw err;
  }
  const cursor = await getMeta('cursor');
  const query = cursor ? `?since=${encodeURIComponent(cursor)}` : '';
  const data = await apiRequest<SyncResponseDTO>(account.server, `/sync${query}`, { token: account.token });
  await applyChanges(data, owner);
  try {
    await downloadMissingFiles(account);
    await downloadMissingImages(account);
    await downloadTherapyLeaflets(account);
    // Farmaci e prestazioni: si riscaricano solo se il server ha importato una versione nuova.
    await refreshCatalogs(account);
  } catch (err) {
    // Rete caduta durante i download: i dati sono aggiornati, il resto arriverà alla prossima.
    if (err instanceof ApiError && err.status === 401) throw err;
  }
  return { pendingFiles: await countMissing(), pendingReports: await countOutbox() };
}
