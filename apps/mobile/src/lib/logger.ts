import { formatLogs, LOG_MESSAGE_MAX, type DeviceLogEntry, type LogEntryDTO, type LogFilter, type LogLevel, type LogListDTO } from '@alby/shared';
import { getDb } from './db';

/**
 * Log tecnici dell'app: salvati nel database cifrato del telefono e inviati al server alla sincronizzazione
 * (vedi sync.ts), dove gli amministratori li vedono insieme a quelli del server. Solo dati tecnici: mai dati
 * sanitari (niente titoli di referti, nomi di pazienti, valori).
 */

/** Voci tenute sul telefono: le più vecchie si eliminano da sole. */
const KEEP = 5000;
const PRUNE_EVERY = 200;
let writes = 0;

const CONSOLE: Record<LogLevel, (...args: unknown[]) => void> = {
  debug: console.debug,
  info: console.info,
  warn: console.warn,
  error: console.error,
};

export function writeLog(level: LogLevel, message: string, details?: Record<string, unknown> | null): void {
  if (__DEV__) CONSOLE[level](`[${level}] ${message}`, ...(details ? [details] : []));
  void getDb()
    .then(async (db) => {
      await db.runAsync(
        'INSERT INTO logs (createdAt, level, message, details) VALUES (?, ?, ?, ?)',
        new Date().toISOString(),
        level,
        message.slice(0, LOG_MESSAGE_MAX),
        details ? JSON.stringify(details) : null,
      );
      if (++writes % PRUNE_EVERY === 0) await db.runAsync('DELETE FROM logs WHERE id <= (SELECT max(id) FROM logs) - ?', KEEP);
    })
    // Un log non deve mai far fallire ciò che sta registrando.
    .catch(() => {});
}

export const logger = {
  debug: (message: string, details?: Record<string, unknown> | null) => writeLog('debug', message, details),
  info: (message: string, details?: Record<string, unknown> | null) => writeLog('info', message, details),
  warn: (message: string, details?: Record<string, unknown> | null) => writeLog('warn', message, details),
  error: (message: string, details?: Record<string, unknown> | null) => writeLog('error', message, details),
};

interface Row {
  id: number;
  createdAt: string;
  level: string;
  message: string;
  details: string | null;
  sent: number;
}

/** Stessa forma dei log del server, così le schermate li mostrano allo stesso modo. */
const toEntry = (r: Row): LogEntryDTO => ({
  id: r.id,
  createdAt: r.createdAt,
  level: r.level as LogLevel,
  source: 'mobile',
  message: r.message,
  details: r.details ? (JSON.parse(r.details) as Record<string, unknown>) : null,
  userName: null,
});

function whereOf(filter: LogFilter): { sql: string; args: (string | number)[] } {
  const parts: string[] = [];
  const args: (string | number)[] = [];
  if (filter.levels) {
    parts.push(filter.levels.length ? `level IN (${filter.levels.map(() => '?').join(', ')})` : '0');
    args.push(...filter.levels);
  }
  if (filter.q) {
    parts.push("message LIKE ? ESCAPE '\\'");
    args.push(`%${filter.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
  }
  return { sql: parts.length ? parts.join(' AND ') : '1', args };
}

export async function listLocalLogs(query: LogFilter & { after?: number; before?: number; limit?: number }): Promise<LogListDTO> {
  const db = await getDb();
  const limit = query.limit ?? 200;
  const where = whereOf(query);
  const rows = await db.getAllAsync<Row>(
    `SELECT * FROM logs WHERE ${where.sql} ${query.after !== undefined ? 'AND id > ?' : ''} ${query.before !== undefined ? 'AND id < ?' : ''}
     ORDER BY id DESC LIMIT ?`,
    ...where.args,
    ...(query.after !== undefined ? [query.after] : []),
    ...(query.before !== undefined ? [query.before] : []),
    limit + 1,
  );
  return { items: rows.slice(0, limit).map(toEntry), hasMore: rows.length > limit };
}

export async function clearLocalLogs(filter: LogFilter): Promise<number> {
  const db = await getDb();
  const where = whereOf(filter);
  return (await db.runAsync(`DELETE FROM logs WHERE ${where.sql}`, ...where.args)).changes;
}

export async function exportLocalLogs(filter: LogFilter): Promise<{ text: string; count: number }> {
  const db = await getDb();
  const where = whereOf(filter);
  const rows = await db.getAllAsync<Row>(`SELECT * FROM logs WHERE ${where.sql} ORDER BY id`, ...where.args);
  return { text: formatLogs(rows.map(toEntry)), count: rows.length };
}

/** Prossimo blocco da inviare al server; `markSent` dopo l'invio riuscito. */
export async function unsentLogs(max = 500): Promise<{ entries: DeviceLogEntry[]; markSent(): Promise<void> }> {
  const db = await getDb();
  const rows = await db.getAllAsync<Row>('SELECT * FROM logs WHERE sent = 0 ORDER BY id LIMIT ?', max);
  const last = rows.at(-1)?.id ?? 0;
  return {
    entries: rows.map((r) => {
      const e = toEntry(r);
      return { createdAt: e.createdAt, level: e.level, message: e.message, details: e.details };
    }),
    markSent: async () => {
      await db.runAsync('UPDATE logs SET sent = 1 WHERE sent = 0 AND id <= ?', last);
    },
  };
}
