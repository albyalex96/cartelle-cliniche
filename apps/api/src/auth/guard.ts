import type { MeDTO, Role } from '@alby/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { HttpError, forbidden } from '../http.js';
import { SESSION_COOKIE, clearSessionCookie, readToken, resolveSession, setSessionCookie } from './session.js';

export type AuthUser = MeDTO;

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser | null;
    sessionId: string | null;
  }
}

export function toAuthUser(u: {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  mustChangePassword: boolean;
}): AuthUser {
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    role: u.role,
    mustChangePassword: u.mustChangePassword,
  };
}

/** Riconosce l'utente da cookie o token su ogni richiesta /api. */
export function registerAuth(app: FastifyInstance) {
  app.decorateRequest('user', null);
  app.decorateRequest('sessionId', null);

  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api/')) return;
    const found = readToken(req);
    if (!found) return;

    const session = await resolveSession(found.token);
    if (!session) {
      if (req.cookies[SESSION_COOKIE]) clearSessionCookie(reply);
      return;
    }
    req.user = toAuthUser(session.user);
    req.sessionId = session.sessionId;
    if (session.refreshed && found.fromCookie) setSessionCookie(reply, found.token);
  });
}

interface RequireOptions {
  /** Consenti l'accesso anche se l'utente deve ancora cambiare la password. */
  allowPendingPasswordChange?: boolean;
}

export function requireUser(req: FastifyRequest, opts: RequireOptions = {}): AuthUser {
  if (!req.user) throw new HttpError(401, 'Accesso richiesto', 'UNAUTHENTICATED');
  if (req.user.mustChangePassword && !opts.allowPendingPasswordChange) {
    throw new HttpError(403, 'Devi cambiare la password prima di continuare', 'PASSWORD_CHANGE_REQUIRED');
  }
  return req.user;
}

export function requireAdmin(req: FastifyRequest): AuthUser {
  const user = requireUser(req);
  if (user.role !== 'ADMIN') throw forbidden();
  return user;
}
