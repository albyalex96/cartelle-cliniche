import { createHash, randomBytes } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { prisma } from '../db.js';

export const SESSION_COOKIE = 'alby_sid';

/** Ogni quanto rinnovare la scadenza di una sessione in uso. */
const REFRESH_AFTER_MS = 5 * 60 * 1000;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export async function createSession(userId: string, req: FastifyRequest): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await prisma.session.create({
    data: {
      id: hashToken(token),
      userId,
      expiresAt: new Date(Date.now() + config.SESSION_TTL_MS),
      userAgent: req.headers['user-agent']?.slice(0, 300) ?? null,
      ip: req.ip,
    },
  });
  return token;
}

export function setSessionCookie(reply: FastifyReply, token: string) {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.COOKIE_SECURE,
    path: '/',
    maxAge: Math.floor(config.SESSION_TTL_MS / 1000),
  });
}

export function clearSessionCookie(reply: FastifyReply) {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

/** Token dalla richiesta: header `Authorization: Bearer` (app mobile) oppure cookie (webapp). */
export function readToken(req: FastifyRequest): { token: string; fromCookie: boolean } | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    const token = auth.slice(7).trim();
    return token ? { token, fromCookie: false } : null;
  }
  const cookie = req.cookies[SESSION_COOKIE];
  return cookie ? { token: cookie, fromCookie: true } : null;
}

export async function resolveSession(token: string) {
  const id = hashToken(token);
  const session = await prisma.session.findUnique({ where: { id }, include: { user: true } });
  if (!session) return null;

  const now = Date.now();
  if (session.expiresAt.getTime() <= now || !session.user.active) {
    await prisma.session.delete({ where: { id } }).catch(() => {});
    return null;
  }

  let refreshed = false;
  if (now - session.lastSeenAt.getTime() > REFRESH_AFTER_MS) {
    await prisma.session.update({
      where: { id },
      data: { lastSeenAt: new Date(now), expiresAt: new Date(now + config.SESSION_TTL_MS) },
    });
    refreshed = true;
  }
  return { sessionId: id, user: session.user, refreshed };
}

export async function destroySession(sessionId: string) {
  await prisma.session.delete({ where: { id: sessionId } }).catch(() => {});
}

/** Chiude tutte le sessioni di un utente, tranne eventualmente quella indicata. */
export async function destroyUserSessions(userId: string, exceptSessionId?: string) {
  await prisma.session.deleteMany({
    where: { userId, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
  });
}

export async function purgeExpiredSessions() {
  await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}
