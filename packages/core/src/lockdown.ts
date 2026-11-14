import { getPrisma } from './db';

/**
 * Blocco accessi ("anti-panico"): finché è attivo, chi non è amministratore non può entrare né usare
 * le sessioni già aperte. Le sessioni però non vengono chiuse: allo sblocco riprendono da dove erano.
 * Lo stato sta nella tabella `settings` (voce `lockdown`), così resta attivo anche dopo un riavvio.
 * Qui solo lettura e scrittura: i controlli dei permessi stanno in `services/lockdown.ts`.
 */

const KEY = 'lockdown';

/** Si controlla a ogni richiesta: si rilegge al massimo ogni 5 secondi (subito, se cambia da qui). */
const CACHE_MS = 5_000;

export interface LockdownState {
  since: Date;
  byUserId: string | null;
}

// In sviluppo Next.js ricarica i moduli: la copia in memoria resta la stessa.
const store = globalThis as unknown as { __albyLockdown?: { at: number; value: LockdownState | null } };

export async function getLockdown(): Promise<LockdownState | null> {
  const cached = store.__albyLockdown;
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;

  const row = await getPrisma().setting.findUnique({ where: { key: KEY } });
  const raw = row?.value as { since?: unknown; byUserId?: unknown } | null | undefined;
  const since = typeof raw?.since === 'string' ? new Date(raw.since) : null;
  const value =
    since && !Number.isNaN(since.getTime())
      ? { since, byUserId: typeof raw?.byUserId === 'string' ? raw.byUserId : null }
      : null;
  store.__albyLockdown = { at: Date.now(), value };
  return value;
}

export async function enableLockdown(byUserId: string): Promise<LockdownState> {
  const value = { since: new Date(), byUserId };
  const json = { since: value.since.toISOString(), byUserId };
  await getPrisma().setting.upsert({ where: { key: KEY }, create: { key: KEY, value: json }, update: { value: json } });
  store.__albyLockdown = { at: Date.now(), value };
  return value;
}

export async function disableLockdown(): Promise<void> {
  await getPrisma().setting.deleteMany({ where: { key: KEY } });
  store.__albyLockdown = { at: Date.now(), value: null };
}
