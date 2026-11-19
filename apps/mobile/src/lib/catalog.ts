import type { CatalogDownloadDTO, DrugCatalogEntryDTO, HealthServiceCatalogEntryDTO, HealthServiceDTO } from '@alby/shared';
import type { SQLiteBindValue, SQLiteDatabase } from 'expo-sqlite';
import { ApiError, apiDownload, apiRequest } from './api';
import { getDb, getMeta } from './db';

/**
 * Elenco dei farmaci AIFA e catalogo delle prestazioni: dati pubblici, copiati per intero sul telefono così
 * si consultano anche offline. Si riscaricano solo quando il server ne importa una versione nuova.
 * Foglietti illustrativi: restano sul telefono quelli già aperti (gli ultimi `KEPT_LEAFLETS`) e quelli dei
 * farmaci nelle terapie dei pazienti (scaricati da soli); questi ultimi si cancellano quando nessuna
 * terapia usa più quel farmaco.
 */

const PAGE_SIZE = 50;
const KEPT_LEAFLETS = 30;
const CATALOG_TIMEOUT_MS = 3 * 60_000;

interface Account {
  server: string;
  token: string;
}

/** Come sul server: minuscolo, senza accenti, solo lettere e cifre separate da uno spazio. */
const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/** Inserisce molte righe con poche istruzioni (una per blocco), dentro la transazione in corso. */
async function insertMany(db: SQLiteDatabase, table: string, columns: string[], rows: SQLiteBindValue[][]) {
  const chunk = Math.floor(900 / columns.length);
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    const values = part.map(() => `(${columns.map(() => '?').join(', ')})`).join(', ');
    await db.runAsync(`INSERT INTO ${table} (${columns.join(', ')}) VALUES ${values}`, part.flat());
  }
}

async function refreshDrugs(account: Account) {
  const have = await getMeta('drugCatalogVersion');
  const res = await apiRequest<CatalogDownloadDTO<DrugCatalogEntryDTO>>(
    account.server,
    `/catalog/drugs${have !== null ? `?version=${encodeURIComponent(have)}` : ''}`,
    { token: account.token, timeoutMs: CATALOG_TIMEOUT_MS },
  );
  if (!res.items) return;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.execAsync('DELETE FROM drug_catalog');
    await insertMany(
      db,
      'drug_catalog',
      ['aic', 'name', 'withdrawn', 'searchText', 'json'],
      res.items!.map(({ searchText, ...d }) => [d.aic, d.name.toLowerCase(), d.withdrawn ? 1 : 0, ` ${searchText}`, JSON.stringify(d)]),
    );
    await db.runAsync('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', 'drugCatalogVersion', res.version ?? '');
  });
}

async function refreshServices(account: Account) {
  const have = await getMeta('serviceCatalogVersion');
  const res = await apiRequest<CatalogDownloadDTO<HealthServiceCatalogEntryDTO>>(
    account.server,
    `/catalog/services${have !== null ? `?version=${encodeURIComponent(have)}` : ''}`,
    { token: account.token, timeoutMs: CATALOG_TIMEOUT_MS },
  );
  if (!res.items) return;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.execAsync('DELETE FROM service_catalog');
    await insertMany(
      db,
      'service_catalog',
      ['id', 'code', 'alphaCode', 'oldCode', 'oldAlphaCode', 'regionalCode', 'validTo', 'searchText', 'json'],
      res.items!.map(({ searchText, ...s }) => [
        s.id,
        s.code,
        s.alphaCode,
        s.oldCode,
        s.oldAlphaCode,
        s.regionalCode,
        s.validTo,
        ` ${searchText}`,
        JSON.stringify(s),
      ]),
    );
    await db.runAsync('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', 'serviceCatalogVersion', res.version ?? '');
  });
}

/** Aggiorna i due cataloghi se sul server ce n'è una versione nuova (di solito non scarica niente). */
export async function refreshCatalogs(account: Account): Promise<void> {
  await refreshDrugs(account);
  await refreshServices(account);
}

// ───────────────────────────── consultazione ─────────────────────────────

export interface LocalCatalogPage<T> {
  /** Il catalogo è sul telefono (`false`: mai scaricato, serve la connessione almeno una volta). */
  downloaded: boolean;
  /** Il server non ha ancora importato il catalogo. */
  empty: boolean;
  items: T[];
  hasMore: boolean;
  total: number;
}

export type LocalDrug = Omit<DrugCatalogEntryDTO, 'searchText'>;

const wordsOf = (q: string) => normalize(q).split(' ').filter(Boolean).slice(0, 6);

/** Farmaci per nome o principio attivo: prima quelli in commercio e quelli il cui nome inizia con il testo. */
export async function searchLocalDrugs(q: string, page: number): Promise<LocalCatalogPage<LocalDrug>> {
  const db = await getDb();
  const version = await getMeta('drugCatalogVersion');
  const words = wordsOf(q);
  const where = words.length ? words.map(() => 'instr(searchText, ?) > 0').join(' AND ') : '1';
  const params = words;
  const [rows, count] = await Promise.all([
    db.getAllAsync<{ json: string }>(
      `SELECT json FROM drug_catalog WHERE ${where}
       ORDER BY withdrawn, ${words.length ? 'instr(searchText, ?) <> 1,' : ''} name, aic LIMIT ? OFFSET ?`,
      ...params,
      ...(words.length ? [` ${words[0]}`] : []),
      PAGE_SIZE,
      (page - 1) * PAGE_SIZE,
    ),
    db.getFirstAsync<{ n: number }>(`SELECT count(*) AS n FROM drug_catalog WHERE ${where}`, ...params),
  ]);
  const total = count?.n ?? 0;
  return {
    downloaded: version !== null,
    empty: version === '',
    items: rows.map((r) => JSON.parse(r.json) as LocalDrug),
    hasMore: page * PAGE_SIZE < total,
    total,
  };
}

export async function getLocalDrug(aic: string): Promise<LocalDrug | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ json: string }>('SELECT json FROM drug_catalog WHERE aic = ?', aic);
  return row ? (JSON.parse(row.json) as LocalDrug) : null;
}

/**
 * Prestazioni per parole della denominazione o per codice, come sul server: un codice con i punti ("89.13")
 * si cerca solo tra i codici; prima le voci in vigore, poi in ordine di codice.
 */
export async function searchLocalServices(q: string, page: number): Promise<LocalCatalogPage<HealthServiceDTO>> {
  const db = await getDb();
  const version = await getMeta('serviceCatalogVersion');
  const words = wordsOf(q);
  let where = 'validTo IS NULL';
  let params: SQLiteBindValue[] = [];
  if (words.length) {
    const code = q.trim().toUpperCase();
    const n = code.length;
    const codeSql =
      '(substr(code, 1, ?) = ? OR substr(alphaCode, 1, ?) = ? OR substr(oldCode, 1, ?) = ? OR substr(oldAlphaCode, 1, ?) = ? OR regionalCode = ?)';
    const codeParams = [n, code, n, code, n, code, n, code, code];
    if (/^[A-Z0-9]+(?:\.[A-Z0-9]*)+$/.test(code)) {
      where = `validTo IS NULL AND ${codeSql}`;
      params = codeParams;
    } else {
      // Una parola con cifre è un codice scritto senza punti: deve essere l'inizio di una parola.
      const byWords = words.map(() => 'instr(searchText, ?) > 0').join(' AND ');
      where = `validTo IS NULL AND ((${byWords}) OR ${codeSql})`;
      params = [...words.map((w) => (/\d/.test(w) ? ` ${w}` : w)), ...codeParams];
    }
  }
  const [rows, count] = await Promise.all([
    db.getAllAsync<{ json: string }>(
      `SELECT json FROM service_catalog WHERE ${where} ORDER BY code IS NULL, code, alphaCode, id LIMIT ? OFFSET ?`,
      ...params,
      PAGE_SIZE,
      (page - 1) * PAGE_SIZE,
    ),
    db.getFirstAsync<{ n: number }>(`SELECT count(*) AS n FROM service_catalog WHERE ${where}`, ...params),
  ]);
  const total = count?.n ?? 0;
  return {
    downloaded: version !== null,
    empty: version === '',
    items: rows.map((r) => JSON.parse(r.json) as HealthServiceDTO),
    hasMore: page * PAGE_SIZE < total,
    total,
  };
}

export async function getLocalService(id: string): Promise<HealthServiceDTO | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ json: string }>('SELECT json FROM service_catalog WHERE id = ?', id);
  return row ? (JSON.parse(row.json) as HealthServiceDTO) : null;
}

// ───────────────────────────── foglietti illustrativi ─────────────────────────────

/** Farmaci (codice AIC a 6 cifre) delle terapie salvate sul telefono che hanno un foglietto. */
export async function therapyLeafletCodes(db: SQLiteDatabase): Promise<Set<string>> {
  const rows = await db.getAllAsync<{ aic: string }>(
    `SELECT DISTINCT substr(json_extract(json, '$.aic'), 1, 6) AS aic FROM medications
     WHERE json_extract(json, '$.aic') IS NOT NULL AND json_extract(json, '$.leafletUrl') IS NOT NULL`,
  );
  return new Set(rows.map((r) => r.aic));
}

/**
 * Dopo una sincronizzazione: via i foglietti dei farmaci che erano in una terapia e non lo sono più
 * (terapia eliminata, paziente non più accessibile), anche se erano stati aperti. Va chiamata nella stessa
 * transazione che ha cambiato le terapie, con l'elenco di prima.
 */
export async function dropUnusedLeaflets(db: SQLiteDatabase, before: Set<string>): Promise<void> {
  const after = await therapyLeafletCodes(db);
  for (const aic of before) if (!after.has(aic)) await db.runAsync('DELETE FROM leaflets WHERE aic = ?', aic);
}

/** Scarica in background i foglietti dei farmaci in terapia che non sono ancora sul telefono. */
export async function downloadTherapyLeaflets(account: Account): Promise<void> {
  const db = await getDb();
  const have = new Set((await db.getAllAsync<{ aic: string }>('SELECT aic FROM leaflets')).map((r) => r.aic));
  for (const aic of await therapyLeafletCodes(db)) {
    if (have.has(aic)) continue;
    let data: Uint8Array;
    try {
      data = (await apiDownload(account.server, `/drugs/${aic}/leaflet`, account.token)).data;
    } catch (err) {
      if (err instanceof ApiError && (err.offline || err.status === 401)) throw err;
      continue; // Sito AIFA non raggiungibile o foglietto tolto: si riprova alla prossima.
    }
    // La terapia potrebbe essere stata eliminata durante il download: si salva solo se serve ancora.
    if ((await therapyLeafletCodes(db)).has(aic)) {
      await db.runAsync('INSERT OR IGNORE INTO leaflets (aic, data, viewedAt) VALUES (?, ?, NULL)', aic, data);
    }
  }
}

/**
 * Foglietto da mostrare: la copia sul telefono se c'è, altrimenti si scarica (`download`) e si tiene.
 * Restano gli ultimi `KEPT_LEAFLETS` aperti, oltre a quelli delle terapie.
 */
export async function openLeaflet(aic: string, download: () => Promise<Uint8Array>): Promise<Uint8Array> {
  const db = await getDb();
  const now = new Date().toISOString();
  const stored = await db.getFirstAsync<{ data: Uint8Array }>('SELECT data FROM leaflets WHERE aic = ?', aic);
  if (stored) {
    await db.runAsync('UPDATE leaflets SET viewedAt = ? WHERE aic = ?', now, aic);
    return stored.data;
  }
  const data = await download();
  await db.runAsync('INSERT OR REPLACE INTO leaflets (aic, data, viewedAt) VALUES (?, ?, ?)', aic, data, now);
  const keep = await therapyLeafletCodes(db);
  const viewed = await db.getAllAsync<{ aic: string }>('SELECT aic FROM leaflets WHERE viewedAt IS NOT NULL ORDER BY viewedAt DESC');
  const extra = viewed.filter((r) => !keep.has(r.aic)).slice(KEPT_LEAFLETS);
  for (const r of extra) await db.runAsync('DELETE FROM leaflets WHERE aic = ?', r.aic);
  return data;
}
