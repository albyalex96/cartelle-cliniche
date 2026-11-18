import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { APP_VERSION, type BackupRestoreResultDTO } from '@alby/shared';
import pg from 'pg';
import { requireAdmin } from '../auth/guard';
import { getConfig } from '../config';
import type { RequestContext } from '../context';
import { getPrisma } from '../db';
import { AppError } from '../errors';
import { disableServerMode } from '../server-modes';
import { clearSettingsCache } from '../settings';
import { zipStream, type ZipEntry } from '../zip';
import { ZipFormatError, ZipReader, type ZipFileEntry } from '../zip-read';
import { writeAudit } from './audit';

/**
 * Backup completo del server in un archivio ZIP, e suo ripristino.
 *
 * Contenuto dell'archivio:
 * - `db/<tabella>/000001.json`, …: le righe di ogni tabella (come le restituisce PostgreSQL con `row_to_json`),
 *   lette tutte nello stesso istante (transazione REPEATABLE READ): il backup è coerente anche se nel frattempo
 *   qualcuno modifica i dati;
 * - `storage/…`: i file dell'archivio (immagini DICOM, anteprime, fogli illustrativi);
 * - `manifest.json`: versione del formato e dell'applicazione, migrazioni applicate, righe per tabella.
 *
 * Le sessioni non vengono salvate: dopo un ripristino tutti devono rientrare.
 * Il ripristino accetta solo backup con le stesse migrazioni del database attuale (stessa struttura delle tabelle).
 * Il codice non guarda mai il contenuto delle righe: le copia così come sono.
 */

const FORMAT = 'alby-cartelle-cliniche-backup';
const FORMAT_VERSION = 1;
/** Tabelle mai salvate né ripristinate (ripristinando si svuotano). */
const SKIPPED_TABLES = new Set(['_prisma_migrations', 'sessions', 'webauthn_challenges']);
/** Righe per file JSON nell'archivio, e dimensione oltre la quale il file si chiude prima. */
const CHUNK_ROWS = 2000;
const CHUNK_BYTES = 16 * 1024 * 1024;
/** File già compressi: si salvano così come sono. */
const PRECOMPRESSED = /\.(png|jpe?g|pdf|zip|gz|webp)$/i;
/** Voce delle impostazioni: data dell'ultimo ripristino (l'app mobile rifà la sincronizzazione completa). */
export const RESTORED_AT_KEY = 'backup.restoredAt';

interface Manifest {
  format: typeof FORMAT;
  version: number;
  appVersion: string;
  createdAt: string;
  migrations: string[];
  tables: Record<string, number>;
  files: number;
}

const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;

async function connect(): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: getConfig().DATABASE_URL });
  await client.connect();
  return client;
}

async function appliedMigrations(client: pg.Client): Promise<string[]> {
  const { rows } = await client.query<{ migration_name: string }>(
    'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name',
  );
  return rows.map((r) => r.migration_name);
}

/** Tabelle dello schema, ordinate in modo che ognuna venga dopo quelle a cui fa riferimento. */
async function orderedTables(client: pg.Client): Promise<string[]> {
  const tables = (
    await client.query<{ name: string }>(`SELECT tablename AS name FROM pg_tables WHERE schemaname = current_schema() ORDER BY tablename`)
  ).rows.map((r) => r.name);
  const refs = (
    await client.query<{ child: string; parent: string }>(
      `SELECT c.relname AS child, p.relname AS parent
         FROM pg_constraint k
         JOIN pg_class c ON c.oid = k.conrelid
         JOIN pg_class p ON p.oid = k.confrelid
        WHERE k.contype = 'f' AND k.connamespace = current_schema()::regnamespace`,
    )
  ).rows;
  const parents = new Map(tables.map((t) => [t, new Set<string>()]));
  for (const { child, parent } of refs) if (child !== parent) parents.get(child)?.add(parent);

  const ordered: string[] = [];
  const done = new Set<string>();
  const visit = (table: string, path: Set<string>) => {
    if (done.has(table)) return;
    if (path.has(table)) throw new Error(`Riferimenti circolari tra tabelle: ${[...path].join(', ')}`);
    path.add(table);
    for (const parent of parents.get(table) ?? []) visit(parent, path);
    path.delete(table);
    done.add(table);
    ordered.push(table);
  };
  for (const table of tables) visit(table, new Set());
  return ordered;
}

/** Nome del file del backup, es. "Backup Cartelle Cliniche 2026-11-17 1530.zip". */
function backupFileName(now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `Backup Cartelle Cliniche ${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}${p(now.getMinutes())}.zip`;
}

/** I file dell'archivio, uno alla volta (esclusi quelli temporanei e le cartelle di lavoro del ripristino). */
async function* storageFiles(root: string, dir = ''): AsyncGenerator<{ rel: string; full: string }> {
  const entries = await readdir(path.join(root, dir), { withFileTypes: true }).catch(() => []);
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name.endsWith('.tmp')) continue;
    const rel = dir ? `${dir}/${e.name}` : e.name;
    if (e.isDirectory()) yield* storageFiles(root, rel);
    else if (e.isFile()) yield { rel, full: path.join(root, dir, e.name) };
  }
}

/**
 * Backup completo (solo amministratori): database e archivio dei file, in un ZIP prodotto mentre si scarica.
 */
export async function exportBackup(ctx: RequestContext): Promise<{ fileName: string; stream: ReadableStream<Uint8Array> }> {
  requireAdmin(ctx);
  const now = new Date();
  const client = await connect();
  let tables: string[];
  let migrations: string[];
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    migrations = await appliedMigrations(client);
    tables = (await orderedTables(client)).filter((t) => !SKIPPED_TABLES.has(t));
  } catch (err) {
    await client.end().catch(() => {});
    throw err;
  }
  await writeAudit(ctx, 'server.backup_exported');

  async function* entries(): AsyncGenerator<ZipEntry> {
    const counts: Record<string, number> = {};
    let files = 0;
    try {
      for (const table of tables) {
        counts[table] = 0;
        let part = 0;
        let rows: string[] = [];
        let bytes = 0;
        const flush = (): ZipEntry => {
          const data = Buffer.from(`[${rows.join(',')}]`, 'utf8');
          rows = [];
          bytes = 0;
          part++;
          return { name: `db/${table}/${String(part).padStart(6, '0')}.json`, date: now, data: async () => data };
        };
        await client.query(`DECLARE backup_rows NO SCROLL CURSOR FOR SELECT row_to_json(t)::text AS j FROM ${quote(table)} t`);
        for (;;) {
          const { rows: batch } = await client.query<{ j: string }>('FETCH 200 FROM backup_rows');
          if (!batch.length) break;
          for (const { j } of batch) {
            rows.push(j);
            bytes += j.length;
            counts[table]++;
            if (rows.length >= CHUNK_ROWS || bytes >= CHUNK_BYTES) yield flush();
          }
        }
        await client.query('CLOSE backup_rows');
        if (rows.length) yield flush();
      }
      await client.query('COMMIT');
    } finally {
      await client.end().catch(() => {});
    }

    const root = getConfig().STORAGE_DIR;
    for await (const file of storageFiles(root)) {
      // Un file eliminato mentre si scarica il backup viene saltato.
      const content = await readFile(file.full).catch(() => null);
      if (!content) continue;
      const { mtime } = await stat(file.full).catch(() => ({ mtime: now }));
      files++;
      yield { name: `storage/${file.rel}`, date: mtime, data: async () => content, compress: !PRECOMPRESSED.test(file.rel) };
    }

    const manifest: Manifest = {
      format: FORMAT,
      version: FORMAT_VERSION,
      appVersion: APP_VERSION,
      createdAt: now.toISOString(),
      migrations,
      tables: counts,
      files,
    };
    yield { name: 'manifest.json', date: now, data: async () => Buffer.from(JSON.stringify(manifest, null, 2), 'utf8') };
  }

  return { fileName: backupFileName(now), stream: zipStream(entries()) };
}

const invalid = (why: string) => new AppError(422, `Il file non è un backup valido: ${why}`, 'BAD_BACKUP');

function readManifest(raw: Buffer): Manifest {
  let m: Partial<Manifest>;
  try {
    m = JSON.parse(raw.toString('utf8'));
  } catch {
    throw invalid('descrizione illeggibile');
  }
  if (m.format !== FORMAT) throw invalid('non è stato creato da Cartelle Cliniche');
  if (m.version !== FORMAT_VERSION) throw invalid('formato non supportato da questa versione');
  if (
    typeof m.createdAt !== 'string' ||
    typeof m.appVersion !== 'string' ||
    !Array.isArray(m.migrations) ||
    !m.tables ||
    typeof m.tables !== 'object' ||
    typeof m.files !== 'number'
  ) {
    throw invalid('descrizione incompleta');
  }
  return m as Manifest;
}

/** Percorso di destinazione di un file dell'archivio, dentro `dir` (rifiuta nomi che ne escono). */
function safeTarget(dir: string, rel: string): string {
  const full = path.resolve(dir, rel);
  if (!rel || rel.includes('\\') || path.isAbsolute(rel) || !full.startsWith(dir + path.sep)) throw invalid(`nome di file non ammesso: ${rel}`);
  return full;
}

const state = globalThis as unknown as { __albyRestoring?: boolean };

/**
 * Ripristino di un backup completo (solo amministratori): sostituisce TUTTI i dati del database e i file
 * dell'archivio con quelli del backup. `upload` è il contenuto del file .zip, letto man mano.
 * Il database cambia in una sola transazione: se qualcosa va storto resta com'era.
 * Tutte le sessioni vengono chiuse, compresa quella di chi ripristina.
 */
export async function restoreBackup(
  ctx: RequestContext,
  upload: ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>,
): Promise<BackupRestoreResultDTO> {
  const { user } = requireAdmin(ctx);
  if (state.__albyRestoring) throw new AppError(409, 'C’è già un ripristino in corso', 'RESTORE_RUNNING');
  state.__albyRestoring = true;

  const root = getConfig().STORAGE_DIR;
  const id = randomUUID();
  const zipPath = path.join(root, `.backup-${id}.zip`);
  const staging = path.join(root, `.restore-${id}`);
  const old = path.join(root, `.old-${id}`);
  let zip: ZipReader | null = null;
  try {
    await mkdir(root, { recursive: true });
    const source = upload instanceof ReadableStream ? Readable.fromWeb(upload as WebReadableStream<Uint8Array>) : Readable.from(upload);
    await pipeline(source, createWriteStream(zipPath, { flags: 'wx' }));

    try {
      zip = await ZipReader.open(zipPath);
    } catch (err) {
      if (err instanceof ZipFormatError) throw invalid(err.message);
      throw err;
    }
    const manifestEntry = zip.entries.get('manifest.json');
    if (!manifestEntry) throw invalid('manca la descrizione (manifest.json)');
    if (manifestEntry.size > 1024 * 1024) throw invalid('descrizione troppo grande');
    const manifest = readManifest(await zip.read(manifestEntry));

    // Righe di ogni tabella e file dell'archivio contenuti nel backup.
    const chunks = new Map<string, ZipFileEntry[]>();
    const files: ZipFileEntry[] = [];
    for (const entry of zip.entries.values()) {
      if (entry.name.endsWith('/')) continue;
      const table = /^db\/([^/]+)\/\d{6}\.json$/.exec(entry.name)?.[1];
      if (table) {
        if (!(table in manifest.tables)) throw invalid(`tabella non prevista: ${table}`);
        const list = chunks.get(table) ?? [];
        list.push(entry);
        chunks.set(table, list);
      } else if (entry.name.startsWith('storage/')) files.push(entry);
    }
    for (const list of chunks.values()) list.sort((a, b) => a.name.localeCompare(b.name));

    const client = await connect();
    let rows = 0;
    try {
      const current = await appliedMigrations(client);
      if (current.join('\n') !== manifest.migrations.join('\n')) {
        const newer = manifest.migrations.some((m) => !current.includes(m));
        throw new AppError(
          422,
          newer
            ? `Il backup è stato creato da una versione più recente dell’applicazione (${manifest.appVersion}): aggiorna il server prima di ripristinarlo.`
            : `Il backup è stato creato da una versione precedente dell’applicazione (${manifest.appVersion}), con una struttura dei dati diversa: non si può ripristinare su questa versione.`,
          'BACKUP_VERSION',
        );
      }
      const tables = await orderedTables(client);
      for (const table of Object.keys(manifest.tables)) {
        if (!tables.includes(table) || SKIPPED_TABLES.has(table)) throw invalid(`tabella non prevista: ${table}`);
      }

      // Prima i file, in una cartella a parte: se l'archivio è danneggiato ci si ferma senza aver toccato nulla.
      await mkdir(staging);
      for (const entry of files) {
        const target = safeTarget(staging, entry.name.slice('storage/'.length));
        await mkdir(path.dirname(target), { recursive: true });
        try {
          await pipeline(await zip.stream(entry), createWriteStream(target, { flags: 'wx' }));
        } catch (err) {
          if (err instanceof ZipFormatError) throw invalid(err.message);
          throw err;
        }
      }

      // Poi il database, tutto in una transazione.
      await client.query('BEGIN');
      try {
        const restorable = tables.filter((t) => t !== '_prisma_migrations');
        await client.query(`TRUNCATE ${restorable.map(quote).join(', ')} RESTART IDENTITY CASCADE`);
        for (const table of restorable) {
          let count = 0;
          for (const entry of chunks.get(table) ?? []) {
            let json: string;
            try {
              json = (await zip.read(entry)).toString('utf8');
            } catch (err) {
              if (err instanceof ZipFormatError) throw invalid(err.message);
              throw err;
            }
            const result = await client.query(
              `INSERT INTO ${quote(table)} SELECT * FROM json_populate_recordset(NULL::${quote(table)}, $1::json)`,
              [json],
            );
            count += result.rowCount ?? 0;
          }
          if (count !== (manifest.tables[table] ?? 0)) throw invalid(`righe mancanti nella tabella ${table}`);
          rows += count;
        }
        // I contatori automatici ripartono dopo il valore più alto ripristinato.
        const serials = await client.query<{ table_name: string; column_name: string }>(
          `SELECT table_name, column_name FROM information_schema.columns
            WHERE table_schema = current_schema() AND (column_default LIKE 'nextval(%' OR is_identity = 'YES')`,
        );
        for (const { table_name: table, column_name: column } of serials.rows) {
          if (table === '_prisma_migrations') continue;
          await client.query(
            `SELECT setval(pg_get_serial_sequence($1, $2), COALESCE((SELECT MAX(${quote(column)}) FROM ${quote(table)}), 0) + 1, false)`,
            [quote(table), column],
          );
        }
        // Blocco accessi e manutenzione attivi al momento del backup non restano attivi.
        await client.query(`DELETE FROM settings WHERE key IN ('lockdown', 'maintenance')`);
        await client.query(
          `INSERT INTO settings (key, value, "updatedAt") VALUES ($1, $2::jsonb, now())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, "updatedAt" = now()`,
          [RESTORED_AT_KEY, JSON.stringify(new Date().toISOString())],
        );
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      }
    } finally {
      await client.end().catch(() => {});
    }

    // Il database è ripristinato: si sostituiscono i file dell'archivio (la cartella può essere un volume Docker,
    // quindi si spostano le voci al suo interno invece di rinominare la cartella).
    await mkdir(old);
    for (const name of await readdir(root)) {
      if (name.startsWith('.')) continue;
      await rename(path.join(root, name), path.join(old, name));
    }
    for (const name of await readdir(staging)) await rename(path.join(staging, name), path.join(root, name));

    clearSettingsCache();
    await disableServerMode('lockdown');
    await disableServerMode('maintenance');
    // L'utente che ripristina può non esistere nel backup: in quel caso la voce non ha autore.
    const exists = await getPrisma().user.findUnique({ where: { id: user.id }, select: { id: true } });
    await writeAudit(ctx, 'server.backup_restored', {
      userId: exists ? user.id : null,
      details: { createdAt: manifest.createdAt, appVersion: manifest.appVersion, rows, files: files.length },
    });

    return {
      createdAt: manifest.createdAt,
      appVersion: manifest.appVersion,
      patients: manifest.tables.patients ?? 0,
      rows,
      files: files.length,
    };
  } finally {
    await zip?.close().catch(() => {});
    await Promise.all([zipPath, staging, old].map((p) => rm(p, { recursive: true, force: true }).catch(() => {})));
    state.__albyRestoring = false;
  }
}
