import { getCatalogAutoUpdates, getServerSettings, getServerStatus, updateServerSettings } from '@alby/core';
import { apiRoute, readJson } from '@/server/api';

/**
 * Impostazioni del server per l'app (solo amministratori): valori, stato e aggiornamento automatico degli elenchi.
 * Permessi, validazione e registro accessi in @alby/core.
 */
export const GET = apiRoute(async (ctx) => {
  const [settings, status, catalogs] = await Promise.all([getServerSettings(ctx), getServerStatus(ctx), getCatalogAutoUpdates(ctx)]);
  return { ...settings, activeSessions: status.activeSessions, auditEntries: status.auditEntries, catalogs };
});

export const PATCH = apiRoute(async (ctx, req) => {
  await updateServerSettings(ctx, await readJson(req));
});
