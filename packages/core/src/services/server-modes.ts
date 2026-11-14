import type { LockdownDTO } from '@alby/shared';
import { requireAdmin } from '../auth/guard';
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
