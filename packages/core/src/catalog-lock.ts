import type { AutoUpdateCatalog } from '@alby/shared';
import { AppError } from './errors';

/**
 * Un solo aggiornamento alla volta per ciascun elenco pubblico (farmaci, prestazioni), che sia
 * avviato a mano o dall'aggiornamento automatico: scaricare due volte lo stesso file non serve.
 */

// In sviluppo Next.js ricarica i moduli: l'insieme resta lo stesso.
const store = globalThis as unknown as { __albyCatalogRunning?: Set<AutoUpdateCatalog> };
const running = (store.__albyCatalogRunning ??= new Set());

export function catalogRunning(catalog: AutoUpdateCatalog): boolean {
  return running.has(catalog);
}

export async function withCatalogLock<T>(catalog: AutoUpdateCatalog, fn: () => Promise<T>): Promise<T> {
  if (running.has(catalog)) {
    throw new AppError(409, 'L’aggiornamento di questo elenco è già in corso: riprova tra qualche minuto', 'CATALOG_BUSY');
  }
  running.add(catalog);
  try {
    return await fn();
  } finally {
    running.delete(catalog);
  }
}
