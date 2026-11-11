import { createHash, randomBytes } from 'node:crypto';
import { getConfig } from '../config';
import type { AuthUser } from '../context';
import { getPrisma } from '../db';

/** Nome del cookie di sessione della webapp. */
export const SESSION_COOKIE = 'alby_sid';

/** Ogni quanto aggiornare "ultimo utilizzo" di una sessione attiva. */
const TOUCH_AFTER_MS = 5 * 60 * 1000;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export function toAuthUser(u: AuthUser): AuthUser {
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    role: u.role,
    mustChangePassword: u.mustChangePassword,
  };
}

/** Crea una sessione e restituisce il token (in chiaro solo qui: nel database ne finisce l'hash). */
export async function createSession(
  userId: string,
  meta: { ip: string | null; userAgent: string | null },
): Promise<{ token: string; expiresAt: Date }> {
  const cfg = getConfig();
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();
  const expiresAt = new Date(now + Math.min(cfg.SESSION_IDLE_MS, cfg.SESSION_MAX_MS));
  await getPrisma().session.create({
    data: {
      id: hashToken(token),
      userId,
      expiresAt,
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
      ip: meta.ip,
    },
  });
  return { token, expiresAt };
}

/**
 * Verifica un token. La sessione scade dopo SESSION_IDLE_DAYS di inattività
 * e comunque dopo SESSION_MAX_DAYS dal login.
 */
export async function resolveSession(token: string): Promise<{ sessionId: string; user: AuthUser } | null> {
  if (!token || token.length > 200) return null;
  const cfg = getConfig();
  const prisma = getPrisma();
  const id = hashToken(token);
  const session = await prisma.session.findUnique({ where: { id }, include: { user: true } });
  if (!session) return null;

  const now = Date.now();
  const tooOld = now - session.createdAt.getTime() > cfg.SESSION_MAX_MS;
  if (session.expiresAt.getTime() <= now || tooOld || !session.user.active) {
    await prisma.session.delete({ where: { id } }).catch(() => {});
    return null;
  }

  if (now - session.lastSeenAt.getTime() > TOUCH_AFTER_MS) {
    const maxEnd = session.createdAt.getTime() + cfg.SESSION_MAX_MS;
    await prisma.session
      .update({
        where: { id },
        data: { lastSeenAt: new Date(now), expiresAt: new Date(Math.min(now + cfg.SESSION_IDLE_MS, maxEnd)) },
      })
      .catch(() => {});
  }
  return { sessionId: id, user: toAuthUser(session.user) };
}

export async function destroySession(sessionId: string) {
  await getPrisma().session.delete({ where: { id: sessionId } }).catch(() => {});
}

/** Chiude tutte le sessioni di un utente, tranne eventualmente quella indicata. */
export async function destroyUserSessions(userId: string, exceptSessionId?: string | null) {
  await getPrisma().session.deleteMany({
    where: { userId, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
  });
}

export async function purgeExpiredSessions() {
  await getPrisma().session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}
