import type { MaintenanceResultDTO } from '@alby/shared';
import { getPrisma } from './db';
import { SYNC_TOMBSTONE_RETENTION_DAYS } from './services/sync';
import { getSettings } from './settings';

/**
 * Pulizia periodica: sessioni scadute, voci del registro più vecchie del periodo di conservazione ed
 * eliminazioni registrate per la sincronizzazione dell'app mobile più vecchie di `SYNC_TOMBSTONE_RETENTION_DAYS`.
 * Non c'è un programma a parte che la avvia: parte da sola, al massimo una volta al giorno,
 * quando qualcuno usa l'applicazione (vedi `resolveSession`).
 */

const DAY_MS = 86_400_000;
const state = globalThis as unknown as { __albyMaintenanceAt?: number };

/** `by`: chi l'ha avviata a mano (per il registro); senza, è la pulizia automatica. */
export async function runMaintenance(
  by: { userId: string | null; ip: string | null } = { userId: null, ip: null },
): Promise<MaintenanceResultDTO> {
  const prisma = getPrisma();
  const { auditRetentionMonths } = await getSettings();
  const now = new Date();

  const sessions = await prisma.session.deleteMany({ where: { expiresAt: { lt: now } } });
  // Eliminazioni troppo vecchie per servire: un telefono fermo da più tempo rifà la sincronizzazione completa.
  await prisma.syncTombstone.deleteMany({
    where: { deletedAt: { lt: new Date(now.getTime() - SYNC_TOMBSTONE_RETENTION_DAYS * DAY_MS) } },
  });

  let auditEntries = 0;
  if (auditRetentionMonths > 0) {
    const cutoff = new Date(now);
    cutoff.setMonth(cutoff.getMonth() - auditRetentionMonths);
    auditEntries = (await prisma.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } })).count;
    if (auditEntries > 0) {
      // L'eliminazione resta scritta nel registro stesso.
      await prisma.auditLog.create({
        data: {
          action: 'server.audit_purged',
          userId: by.userId,
          ip: by.ip,
          details: { entries: auditEntries, retentionMonths: auditRetentionMonths },
        },
      });
    }
  }
  state.__albyMaintenanceAt = now.getTime();
  return { expiredSessions: sessions.count, auditEntries };
}

/** Da chiamare spesso: avvia la pulizia in sottofondo se è passato almeno un giorno dall'ultima. */
export function maintenanceTick() {
  const now = Date.now();
  if (now - (state.__albyMaintenanceAt ?? 0) < DAY_MS) return;
  state.__albyMaintenanceAt = now;
  void runMaintenance().catch((err) => console.error('[manutenzione] pulizia periodica non riuscita', err));
}
