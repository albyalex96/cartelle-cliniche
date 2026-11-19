import { getLockdownStatus, getMaintenanceStatus, setLockdown, setMaintenanceMode } from '@alby/core';
import type { ServerModesDTO } from '@alby/shared';
import { z } from 'zod';
import { apiRoute, readJson } from '@/server/api';

async function current(ctx: Parameters<typeof getLockdownStatus>[0]): Promise<ServerModesDTO> {
  // getLockdownStatus verifica che sia un amministratore.
  return { lockdown: await getLockdownStatus(ctx), maintenance: await getMaintenanceStatus(ctx) };
}

/** Blocco accessi e manutenzione, per gli amministratori dall'app mobile. */
export const GET = apiRoute(async (ctx) => current(ctx));

const bodySchema = z.object({ lockdown: z.boolean().optional(), maintenance: z.unknown().optional() });

/** `{ lockdown: true|false }` e/o `{ maintenance: { active, message } }`; restituisce lo stato aggiornato. Solo amministratori. */
export const POST = apiRoute(async (ctx, req) => {
  const body = bodySchema.parse(await readJson(req));
  if (body.lockdown !== undefined) await setLockdown(ctx, body.lockdown);
  if (body.maintenance !== undefined) await setMaintenanceMode(ctx, body.maintenance);
  return current(ctx);
});
