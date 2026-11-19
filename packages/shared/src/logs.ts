import { z } from 'zod';

/**
 * Log tecnici: richieste all'API ed errori del server, più i log dell'app mobile (salvati sul telefono e
 * inviati al server alla sincronizzazione). Solo dati tecnici: mai dati sanitari.
 */

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export const LOG_LEVEL_LABELS: Record<LogLevel, string> = { debug: 'Debug', info: 'Info', warn: 'Avviso', error: 'Errore' };

export const LOG_SOURCES = ['server', 'mobile'] as const;
export type LogSource = (typeof LOG_SOURCES)[number];

export const LOG_SOURCE_LABELS: Record<LogSource, string> = { server: 'Server', mobile: 'App' };

export const LOG_MESSAGE_MAX = 2000;

export interface LogEntryDTO {
  id: number;
  createdAt: string;
  level: LogLevel;
  source: LogSource;
  message: string;
  details: Record<string, unknown> | null;
  /** Utente della richiesta (o del telefono che ha inviato il log). */
  userName: string | null;
}

/** "warn,error" (query string) o array → livelli validi; vuoto o assente = tutti. */
const levelsSchema = z
  .preprocess((v) => (typeof v === 'string' ? v.split(',').filter(Boolean) : v), z.array(z.enum(LOG_LEVELS)))
  .optional();

/** Filtro comune a elenco, cancellazione ed esportazione. */
export const logFilterSchema = z.object({
  levels: levelsSchema,
  source: z.enum(LOG_SOURCES).optional().catch(undefined),
  /** Testo cercato nel messaggio (senza distinguere maiuscole). */
  q: z.string().trim().max(200).optional(),
});
export type LogFilter = z.infer<typeof logFilterSchema>;

export const logListQuerySchema = logFilterSchema.extend({
  /** Aggiornamento live: solo le voci più nuove di questa. */
  after: z.coerce.number().int().min(0).optional(),
  /** Voci più vecchie di questa (per caricarne altre). */
  before: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export interface LogListDTO {
  /** Dalla più recente. */
  items: LogEntryDTO[];
  /** Ci sono voci più vecchie di quelle restituite. */
  hasMore: boolean;
}

/** Log inviati dal telefono. */
export const deviceLogUploadSchema = z.object({
  entries: z
    .array(
      z.object({
        createdAt: z.iso.datetime(),
        level: z.enum(LOG_LEVELS),
        message: z.string().min(1).max(LOG_MESSAGE_MAX),
        details: z.record(z.string(), z.unknown()).nullable().optional(),
      }),
    )
    .max(500),
});
export type DeviceLogEntry = z.infer<typeof deviceLogUploadSchema>['entries'][number];

/** Una riga di testo per voce, per l'esportazione (uguale su web e app). */
export function formatLogLine(e: Pick<LogEntryDTO, 'createdAt' | 'level' | 'source' | 'message' | 'details' | 'userName'>): string {
  const details = e.details && Object.keys(e.details).length ? ` ${JSON.stringify(e.details)}` : '';
  const user = e.userName ? ` (${e.userName})` : '';
  return `${e.createdAt} ${e.level.toUpperCase().padEnd(5)} [${e.source}]${user} ${e.message}${details}`;
}

export const formatLogs = (entries: Parameters<typeof formatLogLine>[0][]) => entries.map(formatLogLine).join('\n') + '\n';
