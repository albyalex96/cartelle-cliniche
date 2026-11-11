import { setupSchema, type LoginResponseDTO, type SetupStatusDTO } from '@alby/shared';
import type { FastifyInstance } from 'fastify';
import { audit } from '../audit.js';
import { toAuthUser } from '../auth/guard.js';
import { hashPassword } from '../auth/password.js';
import { createSession, setSessionCookie } from '../auth/session.js';
import { prisma } from '../db.js';
import { HttpError, parse } from '../http.js';

/** Primo avvio: finché non esistono utenti si può creare l'amministratore. */
export async function setupRoutes(app: FastifyInstance) {
  app.get('/status', async (): Promise<SetupStatusDTO> => {
    return { needsSetup: (await prisma.user.count()) === 0 };
  });

  app.post(
    '/',
    { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } },
    async (req, reply): Promise<LoginResponseDTO> => {
      const input = parse(setupSchema, req.body);
      const passwordHash = await hashPassword(input.password);

      const user = await prisma.$transaction(async (tx) => {
        // Il lock evita che due richieste simultanee creino due amministratori.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(724001)`;
        if ((await tx.user.count()) > 0) {
          throw new HttpError(409, 'La configurazione iniziale è già stata completata', 'SETUP_DONE');
        }
        return tx.user.create({
          data: {
            email: input.email,
            displayName: input.displayName,
            passwordHash,
            role: 'ADMIN',
            lastLoginAt: new Date(),
          },
        });
      });

      const token = await createSession(user.id, req);
      setSessionCookie(reply, token);
      await audit(req, 'setup.admin_created', { userId: user.id, entity: 'user', entityId: user.id });
      return { user: toAuthUser(user) };
    },
  );
}
