import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';

/**
 * Copia locale dei dati, cifrata con SQLCipher. La chiave è casuale, generata sul telefono e custodita nel
 * Keystore: senza di essa il file del database è illeggibile. Anche i documenti dei referti (PDF e foto)
 * stanno qui dentro come BLOB, così c'è un solo archivio cifrato e uscire dall'account significa
 * cancellare un solo file (più la chiave).
 */

const DB_NAME = 'cartelle.db';
const KEY_NAME = 'alby.dbkey';

/** Versioni dello schema locale: ogni voce porta il database dalla versione precedente a quella successiva. */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
  CREATE TABLE patients (id TEXT PRIMARY KEY NOT NULL, sortKey TEXT NOT NULL, json TEXT NOT NULL);
  CREATE TABLE templates (id TEXT PRIMARY KEY NOT NULL, json TEXT NOT NULL);
  CREATE TABLE reports (
    id TEXT PRIMARY KEY NOT NULL,
    patientId TEXT NOT NULL,
    examDate TEXT NOT NULL,
    fileId TEXT,
    json TEXT NOT NULL
  );
  CREATE INDEX reports_patient ON reports (patientId, examDate);
  CREATE TABLE medications (id TEXT PRIMARY KEY NOT NULL, patientId TEXT NOT NULL, json TEXT NOT NULL);
  CREATE INDEX medications_patient ON medications (patientId);
  CREATE TABLE files (
    id TEXT PRIMARY KEY NOT NULL,
    patientId TEXT NOT NULL,
    mimeType TEXT NOT NULL,
    size INTEGER NOT NULL,
    data BLOB NOT NULL
  );
  `,
];

let opening: Promise<SQLite.SQLiteDatabase> | null = null;

async function databaseKey(): Promise<string> {
  const existing = await SecureStore.getItemAsync(KEY_NAME);
  if (existing) return existing;
  const bytes = await Crypto.getRandomBytesAsync(32);
  const key = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  await SecureStore.setItemAsync(KEY_NAME, key);
  return key;
}

async function open(): Promise<SQLite.SQLiteDatabase> {
  const key = await databaseKey();
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  try {
    // Senza SQLCipher "PRAGMA key" non fa nulla e i dati finirebbero in chiaro: meglio fermarsi.
    const cipher = await db.getFirstAsync<{ cipher_version: string }>('PRAGMA cipher_version');
    if (!cipher?.cipher_version) throw new Error('SQLCipher non disponibile: database locale non cifrato');
    // La chiave è esadecimale (solo [0-9a-f]): nessun rischio di iniezione nella stringa.
    await db.execAsync(`PRAGMA key = '${key}'`);
    // Verifica la chiave (con una chiave sbagliata la prima lettura fallisce).
    const { user_version: version } = (await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))!;
    await db.execAsync('PRAGMA journal_mode = WAL');
    for (let v = version; v < MIGRATIONS.length; v++) {
      await db.withExclusiveTransactionAsync(async (txn) => {
        await txn.execAsync(MIGRATIONS[v]!);
        await txn.execAsync(`PRAGMA user_version = ${v + 1}`);
      });
    }
    return db;
  } catch (err) {
    await db.closeAsync().catch(() => {});
    throw err;
  }
}

/** Database aperto (una sola connessione per tutta l'app). */
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  opening ??= open().catch((err) => {
    opening = null;
    throw err;
  });
  return opening;
}

/**
 * Cancella tutta la copia locale: uscita dall'account, cambio di utente o di server.
 * Elimina anche la chiave, così un'eventuale copia residua del file resterebbe illeggibile.
 */
export async function wipeLocalData(): Promise<void> {
  const current = opening;
  opening = null;
  if (current) {
    const db = await current.catch(() => null);
    await db?.closeAsync().catch(() => {});
  }
  await SQLite.deleteDatabaseAsync(DB_NAME).catch(() => {});
  await SecureStore.deleteItemAsync(KEY_NAME);
}

export async function getMeta(key: string): Promise<string | null> {
  const db = await getDb();
  return (await db.getFirstAsync<{ value: string }>('SELECT value FROM meta WHERE key = ?', key))?.value ?? null;
}
