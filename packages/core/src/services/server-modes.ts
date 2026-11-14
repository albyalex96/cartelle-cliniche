import { maintenanceModeSchema, type LockdownDTO, type MaintenanceModeDTO } from '@alby/shared';
import { requireAdmin, requireUser } from '../auth/guard';
import type { RequestContext } from '../context';
import { getPrisma } from '../db';
import { disableServerMode, enableServerMode, getServerMode, type ServerModeState } from '../server-modes';
import { writeAudit } from './audit';

async function toDTO(state: ServerModeState | null): Promise<LockdownDTO | null> {
  if (!state) return null;
  const by = state.byUserId
    ? await getPrisma().user.findUnique({ where: { id: state.byUserId }, select: { displayName: true } })
    : null;
  return { since: state.since.toISOString(), byName: by?.displayName ?? null };
}

/** Stato del blocco accessi (solo amministratori). */
export async function getLockdownStatus(ctx: RequestContext): Promise<LockdownDTO | null> {
  requireAdmin(ctx);
  return toDTO(await getServerMode('lockdown'));
}

/**
 * Attiva o disattiva il blocco accessi: chi non è amministratore resta sospeso finché dura,
 * senza perdere il login. Per chiudere le sessioni di un account sospetto si reimposta la sua password.
 */
export async function setLockdown(ctx: RequestContext, active: boolean): Promise<LockdownDTO | null> {
  const { user } = requireAdmin(ctx);
  const current = await getServerMode('lockdown');
  if (active === !!current) return toDTO(current);

  if (active) {
    const state = await enableServerMode('lockdown', user.id);
    await writeAudit(ctx, 'server.lockdown_enabled');
    return toDTO(state);
  }
  await disableServerMode('lockdown');
  await writeAudit(ctx, 'server.lockdown_disabled', {
    details: { minutes: Math.round((Date.now() - current!.since.getTime()) / 60_000) },
  });
  return null;
}

/**
 * Stato della modalità manutenzione: lo vedono tutti (avviso in cima alle pagine).
 * Chi l'ha attivata lo vedono solo gli amministratori.
 */
export async function getMaintenanceStatus(ctx: RequestContext): Promise<MaintenanceModeDTO | null> {
  const { user } = requireUser(ctx, { allowPendingPasswordChange: true });
  const state = await getServerMode('maintenance');
  if (!state) return null;
  const dto = (await toDTO(user.role === 'ADMIN' ? state : { ...state, byUserId: null }))!;
  return { ...dto, message: state.message };
}

/**
 * Attiva o disattiva la manutenzione: chi non è amministratore può solo consultare i dati finché dura.
 * Con la manutenzione già attiva, si può cambiare l'avviso. Nel registro finisce solo se c'è un avviso, non il testo.
 */
export async function setMaintenanceMode(ctx: RequestContext, raw: unknown): Promise<MaintenanceModeDTO | null> {
  const { user } = requireAdmin(ctx);
  const input = maintenanceModeSchema.parse(raw);
  const current = await getServerMode('maintenance');

  if (!input.active) {
    if (!current) return null;
    await disableServerMode('maintenance');
    await writeAudit(ctx, 'server.maintenance_disabled', {
      details: { minutes: Math.round((Date.now() - current.since.getTime()) / 60_000) },
    });
    return null;
  }
  if (current && current.message === input.message) return getMaintenanceStatus(ctx);

  const state = current
    ? await enableServerMode('maintenance', current.byUserId ?? user.id, input.message, current.since)
    : await enableServerMode('maintenance', user.id, input.message);
  await writeAudit(ctx, 'server.maintenance_enabled', {
    details: { message: input.message !== null, ...(current ? { updated: true } : {}) },
  });
  return { ...(await toDTO(state))!, message: state.message };
}
