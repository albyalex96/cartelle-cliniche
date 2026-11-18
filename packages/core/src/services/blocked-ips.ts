import { isIP } from 'node:net';
import { requireAdmin } from '../auth/guard';
import type { RequestContext } from '../context';
import { getPrisma } from '../db';
import { AppError } from '../errors';
import { writeAudit } from './audit';

/** Forma unica di un indirizzo, così lo stesso IP scritto in modi diversi non sfugge al blocco. Null se non è valido. */
export function normalizeIp(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const ip = raw.trim().toLowerCase().replace(/%.*$/, '').replace(/^::ffff:(?=\d+\.)/, '');
  const version = isIP(ip);
  if (version === 4) return ip;
  return version === 6 ? new URL(`http://[${ip}]`).hostname.slice(1, -1) : null;
}

function parseIp(raw: unknown): string {
  const ip = normalizeIp(raw);
  if (!ip) throw new AppError(400, 'Indirizzo IP non valido', 'INVALID_IP');
  return ip;
}

export async function listBlockedIps(ctx: RequestContext): Promise<string[]> {
  requireAdmin(ctx);
  const rows = await getPrisma().blockedIp.findMany({ orderBy: { createdAt: 'desc' }, select: { ip: true } });
  return rows.map((r) => r.ip);
}

export async function blockIp(ctx: RequestContext, raw: unknown): Promise<void> {
  requireAdmin(ctx);
  const ip = parseIp(raw);
  if (ip === normalizeIp(ctx.ip)) throw new AppError(400, 'Non puoi bloccare il tuo stesso indirizzo IP', 'CANNOT_BLOCK_SELF');
  const { count } = await getPrisma().blockedIp.createMany({ data: { ip }, skipDuplicates: true });
  if (count > 0) await writeAudit(ctx, 'server.ip_blocked', { details: { ip } });
}

export async function unblockIp(ctx: RequestContext, raw: unknown): Promise<void> {
  requireAdmin(ctx);
  const ip = parseIp(raw);
  const { count } = await getPrisma().blockedIp.deleteMany({ where: { ip } });
  if (count > 0) await writeAudit(ctx, 'server.ip_unblocked', { details: { ip } });
}

/** Da chiamare dopo il limite di tentativi, che tiene sotto controllo anche le voci scritte nel registro. */
export async function assertIpAllowed(ctx: RequestContext): Promise<void> {
  const ip = normalizeIp(ctx.ip);
  if (!ip) return;
  if (!(await getPrisma().blockedIp.findUnique({ where: { ip }, select: { ip: true } }))) return;
  await writeAudit(ctx, 'auth.login_failed', { userId: null, details: { reason: 'indirizzo IP bloccato' } });
  throw new AppError(403, 'L’accesso da questo indirizzo IP è stato bloccato', 'IP_BLOCKED');
}
