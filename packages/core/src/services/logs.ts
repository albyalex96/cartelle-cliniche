import {
  deviceLogUploadSchema,
  formatLogs,
  LOG_MESSAGE_MAX,
  logFilterSchema,
  logListQuerySchema,
  type LogEntryDTO,
  type LogFilter,
  type LogLevel,
  type LogListDTO,
  type LogSource,
} from '@alby/shared';
import { requireAdmin, requireUser } from '../auth/guard';
import type { RequestContext } from '../context';
import { getPrisma, Prisma } from '../db';
import { writeAudit } from './audit';

/**
 * Log tecnici nel database (tabella `app_logs`), consultabili dagli amministratori dal web e dall'app.
 * Ogni voce va anche sulla console del server (`docker logs`). Solo dati tecnici: mai dati sanitari.
 * Si tengono al massimo `MAX_ROWS` voci e `MAX_AGE_DAYS` giorni: le più vecchie si eliminano da sole.
 */

const MAX_ROWS = 50_000;
const MAX_AGE_DAYS = 30;
const PRUNE_EVERY = 500;
const EXPORT_MAX = 20_000;

let writes = 0;

const CONSOLE: Record<LogLevel, (...args: unknown[]) => void> = {
  debug: console.debug,
  info: console.info,
  warn: console.warn,
  error: console.error,
};

interface LogOptions {
  source?: LogSource;
  userId?: string | null;
}

/** Scrive una voce. Non attende e non lancia mai: un log non deve bloccare la richiesta. */
export function writeLog(level: LogLevel, message: string, details?: Record<string, unknown> | null, opts: LogOptions = {}): void {
  const source = opts.source ?? 'server';
  if (source === 'server') CONSOLE[level](`[${level}] ${message}`, ...(details ? [JSON.stringify(details)] : []));
  if (process.env.NODE_ENV === 'test') return;
  void getPrisma()
    .appLog.create({
      data: {
        level,
        source,
        message: message.slice(0, LOG_MESSAGE_MAX),
        details: details ? (details as Prisma.InputJsonValue) : Prisma.JsonNull,
        userId: opts.userId ?? null,
      },
    })
    .then(() => {
      if (++writes % PRUNE_EVERY === 0) void pruneLogs();
    })
    .catch((err: unknown) => console.error('[log] scrittura non riuscita', err));
}

/** Logger del server, con le stesse firme di `console`. */
export const logger = {
  debug: (message: string, details?: Record<string, unknown> | null, opts?: LogOptions) => writeLog('debug', message, details, opts),
  info: (message: string, details?: Record<string, unknown> | null, opts?: LogOptions) => writeLog('info', message, details, opts),
  warn: (message: string, details?: Record<string, unknown> | null, opts?: LogOptions) => writeLog('warn', message, details, opts),
  error: (message: string, details?: Record<string, unknown> | null, opts?: LogOptions) => writeLog('error', message, details, opts),
};

/** Dettagli tecnici di un errore imprevisto (tipo, messaggio, prime righe dello stack). */
export function errorDetails(err: unknown): Record<string, unknown> {
  if (!(err instanceof Error)) return { error: String(err).slice(0, 500) };
  return { error: err.name, message: err.message.slice(0, 500), stack: err.stack?.split('\n').slice(1, 6).map((l) => l.trim()) };
}

async function pruneLogs() {
  try {
    const prisma = getPrisma();
    const newest = await prisma.appLog.findFirst({ orderBy: { id: 'desc' }, select: { id: true } });
    await prisma.appLog.deleteMany({
      where: {
        OR: [
          { createdAt: { lt: new Date(Date.now() - MAX_AGE_DAYS * 86_400_000) } },
          ...(newest ? [{ id: { lte: newest.id - MAX_ROWS } }] : []),
        ],
      },
    });
  } catch (err) {
    console.error('[log] pulizia non riuscita', err);
  }
}

function whereOf(filter: LogFilter): Prisma.AppLogWhereInput {
  return {
    ...(filter.levels?.length ? { level: { in: filter.levels } } : {}),
    ...(filter.source ? { source: filter.source } : {}),
    ...(filter.q ? { message: { contains: filter.q, mode: 'insensitive' } } : {}),
  };
}

type Row = Prisma.AppLogGetPayload<{ include: { user: { select: { displayName: true } } } }>;

const toDTO = (r: Row): LogEntryDTO => ({
  id: r.id,
  createdAt: r.createdAt.toISOString(),
  level: r.level as LogLevel,
  source: r.source as LogSource,
  message: r.message,
  details: r.details && typeof r.details === 'object' && !Array.isArray(r.details) ? (r.details as Record<string, unknown>) : null,
  userName: r.user?.displayName ?? null,
});

/** Voci dalla più recente: `after` per l'aggiornamento live, `before` per caricarne di più vecchie. */
export async function listLogs(ctx: RequestContext, rawQuery: unknown): Promise<LogListDTO> {
  requireAdmin(ctx);
  const { after, before, limit, ...filter } = logListQuerySchema.parse(rawQuery);
  const rows = await getPrisma().appLog.findMany({
    where: {
      ...whereOf(filter),
      ...(after !== undefined || before !== undefined ? { id: { ...(after !== undefined ? { gt: after } : {}), ...(before !== undefined ? { lt: before } : {}) } } : {}),
    },
    orderBy: { id: 'desc' },
    take: limit + 1,
    include: { user: { select: { displayName: true } } },
  });
  return { items: rows.slice(0, limit).map(toDTO), hasMore: rows.length > limit };
}

/** Cancella le voci che corrispondono al filtro (tutte, senza filtro). */
export async function clearLogs(ctx: RequestContext, rawFilter: unknown): Promise<{ deleted: number }> {
  requireAdmin(ctx);
  const filter = logFilterSchema.parse(rawFilter);
  const { count } = await getPrisma().appLog.deleteMany({ where: whereOf(filter) });
  await writeAudit(ctx, 'server.logs_cleared', { details: { deleted: count, filtered: !!(filter.levels?.length || filter.source || filter.q) } });
  return { deleted: count };
}

/** Le voci che corrispondono al filtro, come testo (una riga per voce, dalla più vecchia). */
export async function exportLogs(ctx: RequestContext, rawFilter: unknown): Promise<{ text: string; count: number }> {
  requireAdmin(ctx);
  const filter = logFilterSchema.parse(rawFilter);
  const rows = await getPrisma().appLog.findMany({
    where: whereOf(filter),
    orderBy: { id: 'desc' },
    take: EXPORT_MAX,
    include: { user: { select: { displayName: true } } },
  });
  await writeAudit(ctx, 'server.logs_exported', { details: { entries: rows.length } });
  return { text: formatLogs(rows.reverse().map(toDTO)), count: rows.length };
}

/** Log inviati da un telefono (dell'utente che li invia). */
export async function uploadDeviceLogs(ctx: RequestContext, rawBody: unknown): Promise<{ received: number }> {
  const { user } = requireUser(ctx);
  const { entries } = deviceLogUploadSchema.parse(rawBody);
  if (!entries.length) return { received: 0 };
  await getPrisma().appLog.createMany({
    data: entries.map((e) => ({
      createdAt: new Date(e.createdAt),
      level: e.level,
      source: 'mobile',
      message: e.message,
      details: e.details ? (e.details as Prisma.InputJsonValue) : Prisma.JsonNull,
      userId: user.id,
    })),
  });
  return { received: entries.length };
}
