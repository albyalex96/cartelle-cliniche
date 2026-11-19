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
  /** Cartella dei file grandi (immagini DICOM). Di default .data/storage nella cartella principale. */
  STORAGE_DIR: z.string().min(1).optional(),
  /** Riconoscimento del testo nei PDF scansionati (OCR, sempre in locale). Spento: comportamento di prima. */
  OCR_ENABLED: bool.default(false),
  /** "native" = programma tesseract del sistema (immagine Docker); "wasm" = tesseract.js, nessuna installazione. */
  OCR_ENGINE: z.enum(['native', 'wasm']).default('wasm'),
  /** Oltre questo numero di pagine la scansione non viene letta (protegge CPU e memoria). */
  OCR_MAX_PAGES: z.coerce.number().int().positive().max(100).default(10),
  /** Tempo massimo per pagina, in secondi. */
  OCR_PAGE_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(60),
  /** Percorso del programma tesseract, se non è nel PATH (solo per OCR_ENGINE=native). */
  OCR_TESSERACT_PATH: z.string().min(1).optional(),
  /** Chiave che cifra i segreti della verifica in due passaggi. Senza, la funzione non si può attivare. */
  TWO_FACTOR_KEY: z.string().min(32, 'TWO_FACTOR_KEY deve avere almeno 32 caratteri').optional(),
  /** Indirizzo pubblico della webapp (es. https://cartelle.esempio.it): le passkey sono legate a questo dominio. */
  APP_URL: z.url().optional(),
});

/**
 * Cerca il file .env risalendo dalla cartella corrente (Next.js gira in apps/web,
 * Prisma e gli script in packages/core: il file sta nella cartella principale).
 */
let rootDir: string | undefined;

export function loadRootEnv(from = process.cwd()) {
  let dir = from;
  for (let i = 0; i < 4; i++) {
    const file = path.join(dir, '.env');
    if (existsSync(file)) {
      rootDir ??= dir;
      if (!process.env.DATABASE_URL) process.loadEnvFile(file);
      return;
    }
    dir = path.dirname(dir);
  }
}

export type Config = ReturnType<typeof readConfig>;

function readConfig() {
  loadRootEnv();
  // Una variabile vuota (es. "${X:-}" in docker-compose) vale come non impostata.
  const setVars = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ''));
  const parsed = envSchema.safeParse(setVars);
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
    // Senza STORAGE_DIR: accanto al database di sviluppo (.data è esclusa da git).
    STORAGE_DIR: path.resolve(env.STORAGE_DIR ?? path.join(rootDir ?? process.cwd(), '.data', 'storage')),
  };
}

let cached: Config | undefined;

/** Letta al primo utilizzo (non all'import), così la build non richiede le variabili d'ambiente. */
export function getConfig(): Config {
  cached ??= readConfig();
  return cached;
}
