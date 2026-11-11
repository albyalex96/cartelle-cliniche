import { changePasswordSchema, loginSchema, type LoginResponseDTO, type MeDTO } from '@alby/shared';
import type { FastifyInstance } from 'fastify';
import { audit } from '../audit.js';
import { requireUser, toAuthUser } from '../auth/guard.js';
import { hashPassword, simulatePasswordCheck, verifyPassword } from '../auth/password.js';
import {
  clearSessionCookie,
  createSession,
  destroySession,
  destroyUserSessions,
  setSessionCookie,
} from '../auth/session.js';
import { prisma } from '../db.js';
import { HttpError, parse } from '../http.js';

const INVALID_CREDENTIALS = 'Email o password non corretti';

export async function authRoutes(app: FastifyInstance) {
  app.post(
    '/login',
    { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } },
    async (req, reply): Promise<LoginResponseDTO> => {
      const input = parse(loginSchema, req.body);
      const user = await prisma.user.findUnique({ where: { email: input.email } });

      if (!user) {
        await simulatePasswordCheck(input.password);
        await audit(req, 'auth.login_failed', { userId: null, details: { email: input.email } });
        throw new HttpError(401, INVALID_CREDENTIALS, 'INVALID_CREDENTIALS');
      }
      const ok = await verifyPassword(user.passwordHash, input.password);
      if (!ok || !user.active) {
        await audit(req, 'auth.login_failed', {
          userId: user.id,
          details: { reason: ok ? 'utente disattivato' : 'password errata' },
        });
        throw new HttpError(401, INVALID_CREDENTIALS, 'INVALID_CREDENTIALS');
      }

      await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      const token = await createSession(user.id, req);
      await audit(req, 'auth.login', { userId: user.id, details: { client: input.client } });

      if (input.client === 'mobile') return { user: toAuthUser(user), token };
      setSessionCookie(reply, token);
      return { user: toAuthUser(user) };
    },
  );

  app.post('/logout', async (req, reply) => {
    if (req.sessionId) {
      await destroySession(req.sessionId);
      await audit(req, 'auth.logout');
    }
    clearSessionCookie(reply);
    return reply.code(204).send();
  });

  app.get('/me', async (req): Promise<MeDTO> => {
    return requireUser(req, { allowPendingPasswordChange: true });
  });

  app.post(
    '/change-password',
    { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } },
    async (req): Promise<MeDTO> => {
      const me = requireUser(req, { allowPendingPasswordChange: true });
      const input = parse(changePasswordSchema, req.body);

      const user = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
      if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
        throw new HttpError(400, 'La password attuale non è corretta', 'WRONG_PASSWORD');
      }
      if (input.currentPassword === input.newPassword) {
        throw new HttpError(400, 'La nuova password deve essere diversa da quella attuale', 'SAME_PASSWORD');
      }

      const updated = await prisma.user.update({
        where: { id: me.id },
        data: { passwordHash: await hashPassword(input.newPassword), mustChangePassword: false },
      });
      // Le altre sessioni (altri dispositivi) vengono chiuse.
      await destroyUserSessions(me.id, req.sessionId ?? undefined);
      await audit(req, 'auth.password_changed');
      return toAuthUser(updated);
    },
  );
}
