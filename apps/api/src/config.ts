import path from 'node:path';
import { z } from 'zod';

export const API_ROOT = path.resolve(import.meta.dirname, '..');

try {
  process.loadEnvFile(path.join(API_ROOT, '.env'));
} catch {
  // In produzione le variabili arrivano dall'ambiente del container.
}

const bool = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL è obbligatoria'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  COOKIE_SECURE: bool.optional(),
  TRUST_PROXY: bool.default(false),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
  WEB_DIST: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Configurazione non valida:\n' + z.prettifyError(parsed.error));
  process.exit(1);
}

const env = parsed.data;

export const config = {
  ...env,
  isProduction: env.NODE_ENV === 'production',
  COOKIE_SECURE: env.COOKIE_SECURE ?? env.NODE_ENV === 'production',
  SESSION_TTL_MS: env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
  WEB_DIST: env.WEB_DIST ? path.resolve(API_ROOT, env.WEB_DIST) : undefined,
};
