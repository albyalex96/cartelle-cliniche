import { createHash, randomBytes } from 'node:crypto';
import type { AuthUser } from '../context';
import { getPrisma } from '../db';
import { getLockdown } from '../lockdown';
import { maintenanceTick } from '../maintenance';
import { getSessionLimits } from '../settings';

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
  const limits = await getSessionLimits();
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();
  const expiresAt = new Date(now + Math.min(limits.idleMs, limits.maxMs));
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

/** Esito della verifica di un token. */
export type SessionLookup =
  | { status: 'none' }
  /** Sessione valida ma sospesa dal blocco accessi (utente non amministratore): riprenderà allo sblocco. */
  | { status: 'suspended' }
  | { status: 'active'; sessionId: string; user: AuthUser };

/**
 * Verifica un token. La sessione scade dopo un periodo di inattività e comunque dopo una durata
 * massima dal login: i due valori si scelgono nelle impostazioni del server (predefiniti dal file .env).
 * Con il blocco accessi attivo, le sessioni di chi non è amministratore risultano sospese.
 */
export async function lookupSession(token: string): Promise<SessionLookup> {
  if (!token || token.length > 200) return { status: 'none' };
  maintenanceTick();
  const limits = await getSessionLimits();
  const prisma = getPrisma();
  const id = hashToken(token);
  const session = await prisma.session.findUnique({ where: { id }, include: { user: true } });
  if (!session) return { status: 'none' };

  const now = Date.now();
  const tooOld = now - session.createdAt.getTime() > limits.maxMs;
  if (session.expiresAt.getTime() <= now || tooOld || !session.user.active) {
    await prisma.session.delete({ where: { id } }).catch(() => {});
    return { status: 'none' };
  }

  // Durante il blocco la sessione non si usa: "ultimo utilizzo" resta fermo e la scadenza per inattività corre.
  if (session.user.role !== 'ADMIN' && (await getLockdown())) return { status: 'suspended' };

  if (now - session.lastSeenAt.getTime() > TOUCH_AFTER_MS) {
    const maxEnd = session.createdAt.getTime() + limits.maxMs;
    await prisma.session
      .update({
        where: { id },
        data: { lastSeenAt: new Date(now), expiresAt: new Date(Math.min(now + limits.idleMs, maxEnd)) },
      })
      .catch(() => {});
  }
  return { status: 'active', sessionId: id, user: toAuthUser(session.user) };
}

/** Come `lookupSession`, ma una sessione sospesa vale come assente. */
export async function resolveSession(token: string): Promise<{ sessionId: string; user: AuthUser } | null> {
  const found = await lookupSession(token);
  return found.status === 'active' ? { sessionId: found.sessionId, user: found.user } : null;
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

/** Durata del cookie di sessione, in secondi: quanto la durata massima di una sessione. */
export async function sessionCookieMaxAge(): Promise<number> {
  return Math.floor((await getSessionLimits()).maxMs / 1000);
}

export async function purgeExpiredSessions() {
  await getPrisma().session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}
