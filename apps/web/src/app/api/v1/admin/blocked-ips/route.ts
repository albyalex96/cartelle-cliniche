import { blockIp, listBlockedIps, normalizeIp, unblockIp } from '@alby/core';
import { z } from 'zod';
import { apiRoute, readJson } from '@/server/api';

const bodySchema = z.object({ ip: z.string(), blocked: z.boolean() });

/**
 * Indirizzi IP bloccati (solo amministratori), con l'indirizzo da cui arriva la richiesta (da non bloccare).
 * Permessi, validazione e registro accessi: `listBlockedIps` / `blockIp` / `unblockIp` in @alby/core.
 */
export const GET = apiRoute(async (ctx) => ({ ips: await listBlockedIps(ctx), ownIp: normalizeIp(ctx.ip) }));

/** Blocca (`blocked: true`) o sblocca un indirizzo. */
export const POST = apiRoute(async (ctx, req) => {
  const { ip, blocked } = bodySchema.parse(await readJson(req));
  await (blocked ? blockIp(ctx, ip) : unblockIp(ctx, ip));
});
