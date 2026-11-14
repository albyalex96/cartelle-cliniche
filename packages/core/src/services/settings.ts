import {
  AUTO_UPDATE_CATALOGS,
  catalogSettingKeys,
  serverSettingsUpdateSchema,
  type AutoUpdateCatalog,
  type CatalogAutoUpdateDTO,
  sessionDaysAreConsistent,
  type MaintenanceResultDTO,
  type ServerSettings,
  type ServerSettingsDTO,
  type ServerStatusDTO,
  type StorageUsageDTO,
} from '@alby/shared';
import { z } from 'zod';
import { requireAdmin, requireUser } from '../auth/guard';
import { catalogAutoUpdateStatus } from '../catalog-updates';
import { getConfig } from '../config';
import type { RequestContext } from '../context';
import { getPrisma } from '../db';
import { runMaintenance } from '../maintenance';
import { defaultSettings, getSettings, saveSettings } from '../settings';
import { storageUsage } from '../storage';
import { writeAudit } from './audit';

/** Impostazioni del server (solo amministratori). */
export async function getServerSettings(ctx: RequestContext): Promise<ServerSettingsDTO> {
  requireAdmin(ctx);
  return { values: await getSettings(), defaults: defaultSettings() };
}

/** Modifica una o più impostazioni: le voci non indicate restano come sono. */
export async function updateServerSettings(ctx: RequestContext, raw: unknown): Promise<ServerSettings> {
  requireAdmin(ctx);
  const patch = serverSettingsUpdateSchema.parse(raw);
  const current = await getSettings();
  const next = { ...current, ...patch };
  if (!sessionDaysAreConsistent(next)) {
    throw new z.ZodError([
      { code: 'custom', path: ['sessionIdleDays'], message: 'Non può superare la durata massima', input: next.sessionIdleDays },
    ]);
  }

  const changed = Object.fromEntries(
    Object.entries(patch).filter(([key, value]) => value !== undefined && value !== current[key as keyof ServerSettings]),
  ) as Partial<ServerSettings>;
  if (Object.keys(changed).length === 0) return current;

  await saveSettings(changed);
  await writeAudit(ctx, 'server.settings_updated', { entity: 'settings', details: { changed } });
  return next;
}

/**
 * Chiude le sessioni di tutti gli utenti su tutti i dispositivi, tranne quella di chi lo chiede
 * (utile se si sospetta un accesso non autorizzato). Restituisce quante ne ha chiuse.
 */
export async function revokeAllSessions(ctx: RequestContext): Promise<number> {
  requireAdmin(ctx);
  const { count } = await getPrisma().session.deleteMany({
    where: ctx.sessionId ? { id: { not: ctx.sessionId } } : {},
  });
  await writeAudit(ctx, 'server.sessions_revoked', { details: { sessions: count } });
  return count;
}

/** Avvia subito la pulizia periodica (sessioni scadute, voci del registro oltre il periodo di conservazione). */
export async function runMaintenanceNow(ctx: RequestContext): Promise<MaintenanceResultDTO> {
  const { user } = requireAdmin(ctx);
  return runMaintenance({ userId: user.id, ip: ctx.ip });
}

/** Programmazione e stato dell'aggiornamento automatico degli elenchi pubblici (solo amministratori). */
export async function getCatalogAutoUpdates(ctx: RequestContext): Promise<Record<AutoUpdateCatalog, CatalogAutoUpdateDTO>> {
  requireAdmin(ctx);
  const entries = await Promise.all(AUTO_UPDATE_CATALOGS.map(async (c) => [c, await catalogAutoUpdateStatus(c)] as const));
  return Object.fromEntries(entries) as Record<AutoUpdateCatalog, CatalogAutoUpdateDTO>;
}

/** Se l'elenco si aggiorna da solo: lo vedono tutti, nella pagina dell'elenco. */
export async function isCatalogAutoUpdateEnabled(ctx: RequestContext, catalog: AutoUpdateCatalog): Promise<boolean> {
  requireUser(ctx);
  return (await getSettings())[catalogSettingKeys(catalog).enabled];
}

const startedAt = new Date(Date.now() - process.uptime() * 1000).toISOString();

/** Stato del server: versioni, dimensioni e conteggi. Nessun dato dei pazienti. */
export async function getServerStatus(ctx: RequestContext): Promise<ServerStatusDTO> {
  requireAdmin(ctx);
  const cfg = getConfig();
  const prisma = getPrisma();
  const [db, users, activeSessions, auditEntries, oldestAudit] = await Promise.all([
    prisma.$queryRaw<[{ bytes: bigint; version: string }]>`
      SELECT pg_database_size(current_database()) AS bytes, current_setting('server_version') AS version`,
    prisma.user.count({ where: { active: true } }),
    prisma.session.count({ where: { expiresAt: { gt: new Date() } } }),
    prisma.auditLog.count(),
    prisma.auditLog.findFirst({ select: { createdAt: true }, orderBy: { createdAt: 'asc' } }),
  ]);
  return {
    environment: cfg.NODE_ENV,
    nodeVersion: process.versions.node,
    platform: `${process.platform} ${process.arch}`,
    startedAt,
    databaseVersion: db[0].version,
    databaseBytes: Number(db[0].bytes),
    users,
    activeSessions,
    auditEntries,
    oldestAuditAt: oldestAudit?.createdAt.toISOString() ?? null,
    trustProxy: cfg.TRUST_PROXY,
    cookieSecure: cfg.COOKIE_SECURE,
    storageDir: cfg.STORAGE_DIR,
  };
}

/** Spazio occupato dall'archivio dei file. A parte dallo stato perché, con molte immagini, richiede più tempo. */
export async function getStorageUsage(ctx: RequestContext): Promise<StorageUsageDTO> {
  requireAdmin(ctx);
  return storageUsage();
}
