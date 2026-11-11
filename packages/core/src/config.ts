import { existsSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const bool = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL è obbligatoria'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  /** Una sessione inutilizzata per questo numero di giorni scade. */
  SESSION_IDLE_DAYS: z.coerce.number().int().positive().default(30),
  /** Dopo questo numero di giorni dal login bisogna comunque rientrare. */
  SESSION_MAX_DAYS: z.coerce.number().int().positive().default(90),
  /** Considera l'header X-Forwarded-For (solo dietro un reverse proxy fidato). */
  TRUST_PROXY: bool.default(false),
  /** Cookie solo su HTTPS. Di default attivo in produzione. */
  COOKIE_SECURE: bool.optional(),
});

/**
 * Cerca il file .env risalendo dalla cartella corrente (Next.js gira in apps/web,
 * Prisma e gli script in packages/core: il file sta nella cartella principale).
 */
export function loadRootEnv(from = process.cwd()) {
  if (process.env.DATABASE_URL) return;
  let dir = from;
  for (let i = 0; i < 4; i++) {
    const file = path.join(dir, '.env');
    if (existsSync(file)) {
      process.loadEnvFile(file);
      return;
    }
    dir = path.dirname(dir);
  }
}

export type Config = ReturnType<typeof readConfig>;

function readConfig() {
  loadRootEnv();
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error('Configurazione non valida:\n' + z.prettifyError(parsed.error));
  }
  const env = parsed.data;
  return {
    ...env,
    isProduction: env.NODE_ENV === 'production',
    COOKIE_SECURE: env.COOKIE_SECURE ?? env.NODE_ENV === 'production',
    SESSION_IDLE_MS: env.SESSION_IDLE_DAYS * 86_400_000,
    SESSION_MAX_MS: env.SESSION_MAX_DAYS * 86_400_000,
  };
}

let cached: Config | undefined;

/** Letta al primo utilizzo (non all'import), così la build non richiede le variabili d'ambiente. */
export function getConfig(): Config {
  cached ??= readConfig();
  return cached;
}
