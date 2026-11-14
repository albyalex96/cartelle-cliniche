import { getPrisma } from './db';

/**
 * Modalità del server attivate da un amministratore, valide per tutti finché non le disattiva:
 * - `lockdown` (blocco accessi, "anti-panico"): chi non è amministratore non può entrare né usare le sessioni
 *   già aperte, che però non vengono chiuse e riprendono allo sblocco;
 * - `maintenance` (manutenzione): chi non è amministratore può solo consultare i dati, non modificarli.
 * Lo stato sta nella tabella `settings` (una voce per modalità), così resta attivo anche dopo un riavvio.
 * Qui solo lettura e scrittura: i controlli dei permessi stanno in `services/server-modes.ts`.
 */

export type ServerMode = 'lockdown' | 'maintenance';

export interface ServerModeState {
  since: Date;
  byUserId: string | null;
  /** Avviso facoltativo scritto da chi l'ha attivata (es. "fino alle 18:00"). */
  message: string | null;
}

/** Si controlla a ogni richiesta: si rilegge al massimo ogni 5 secondi (subito, se cambia da qui). */
const CACHE_MS = 5_000;

// In sviluppo Next.js ricarica i moduli: la copia in memoria resta la stessa.
const store = globalThis as unknown as {
  __albyServerModes?: Partial<Record<ServerMode, { at: number; value: ServerModeState | null }>>;
};
const cache = () => (store.__albyServerModes ??= {});

export async function getServerMode(mode: ServerMode): Promise<ServerModeState | null> {
  const cached = cache()[mode];
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;

  const row = await getPrisma().setting.findUnique({ where: { key: mode } });
  const raw = row?.value as { since?: unknown; byUserId?: unknown; message?: unknown } | null | undefined;
  const since = typeof raw?.since === 'string' ? new Date(raw.since) : null;
  const value =
    since && !Number.isNaN(since.getTime())
      ? {
          since,
          byUserId: typeof raw?.byUserId === 'string' ? raw.byUserId : null,
          message: typeof raw?.message === 'string' && raw.message ? raw.message : null,
        }
      : null;
  cache()[mode] = { at: Date.now(), value };
  return value;
}

export async function enableServerMode(mode: ServerMode, byUserId: string, message: string | null = null): Promise<ServerModeState> {
  const value = { since: new Date(), byUserId, message };
  const json = { since: value.since.toISOString(), byUserId, message };
  await getPrisma().setting.upsert({ where: { key: mode }, create: { key: mode, value: json }, update: { value: json } });
  cache()[mode] = { at: Date.now(), value };
  return value;
}

export async function disableServerMode(mode: ServerMode): Promise<void> {
  await getPrisma().setting.deleteMany({ where: { key: mode } });
  cache()[mode] = { at: Date.now(), value: null };
}
