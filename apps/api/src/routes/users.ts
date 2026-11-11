import {
  idParamsSchema,
  resetPasswordSchema,
  userCreateSchema,
  userUpdateSchema,
  type AccessEntry,
  type UserDTO,
} from '@alby/shared';
import type { FastifyInstance } from 'fastify';
import { audit } from '../audit.js';
import { requireAdmin } from '../auth/guard.js';
import { hashPassword } from '../auth/password.js';
import { destroyUserSessions } from '../auth/session.js';
import { Prisma, prisma } from '../db.js';
import { toUserDTO } from '../dto.js';
import { HttpError, notFound, parse } from '../http.js';

const withAccess = { patientAccess: { include: { patient: true } } } satisfies Prisma.UserInclude;

/** Elimina doppioni (vince l'ultima voce) e verifica che i pazienti esistano. */
async function normalizeAccess(entries: AccessEntry[]) {
  const unique = [...new Map(entries.map((e) => [e.patientId, e])).values()];
  if (unique.length === 0) return unique;
  const found = await prisma.patient.count({ where: { id: { in: unique.map((e) => e.patientId) } } });
  if (found !== unique.length) throw new HttpError(400, 'Uno o più pazienti selezionati non esistono', 'BAD_PATIENT');
  return unique;
}

export async function userRoutes(app: FastifyInstance) {
  app.get('/', async (req): Promise<UserDTO[]> => {
    requireAdmin(req);
    const users = await prisma.user.findMany({ include: withAccess, orderBy: { displayName: 'asc' } });
    return users.map(toUserDTO);
  });

  app.post('/', async (req, reply): Promise<UserDTO> => {
    requireAdmin(req);
    const input = parse(userCreateSchema, req.body);
    const access = input.role === 'ADMIN' ? [] : await normalizeAccess(input.access);

    const user = await prisma.user.create({
      data: {
        email: input.email,
        displayName: input.displayName,
        role: input.role,
        passwordHash: await hashPassword(input.password),
        // La password iniziale la sceglie l'amministratore: al primo accesso va cambiata.
        mustChangePassword: true,
        patientAccess: { create: access },
      },
      include: withAccess,
    });
    await audit(req, 'user.created', {
      entity: 'user',
      entityId: user.id,
      details: { email: user.email, role: user.role },
    });
    reply.code(201);
    return toUserDTO(user);
  });

  app.patch('/:id', async (req): Promise<UserDTO> => {
    const me = requireAdmin(req);
    const { id } = parse(idParamsSchema, req.params);
    const input = parse(userUpdateSchema, req.body);

    const current = await prisma.user.findUnique({ where: { id } });
    if (!current) throw notFound('Utente');

    const losesAdmin =
      current.role === 'ADMIN' &&
      ((input.role !== undefined && input.role !== 'ADMIN') || input.active === false);
    if (losesAdmin) {
      if (id === me.id) {
        throw new HttpError(400, 'Non puoi rimuovere i permessi di amministratore a te stesso', 'SELF_DEMOTE');
      }
      const otherAdmins = await prisma.user.count({ where: { role: 'ADMIN', active: true, id: { not: id } } });
      if (otherAdmins === 0) throw new HttpError(400, 'Deve restare almeno un amministratore attivo', 'LAST_ADMIN');
    }

    const role = input.role ?? current.role;
    const access =
      role === 'ADMIN' ? [] : input.access !== undefined ? await normalizeAccess(input.access) : undefined;

    const user = await prisma.$transaction(async (tx) => {
      if (access !== undefined) {
        await tx.patientAccess.deleteMany({ where: { userId: id } });
        if (access.length) await tx.patientAccess.createMany({ data: access.map((a) => ({ ...a, userId: id })) });
      }
      return tx.user.update({
        where: { id },
        data: {
          displayName: input.displayName,
          email: input.email,
          role: input.role,
          active: input.active,
        },
        include: withAccess,
      });
    });

    if (input.active === false || (input.role && input.role !== current.role)) {
      await destroyUserSessions(id);
    }
    await audit(req, 'user.updated', {
      entity: 'user',
      entityId: id,
      details: { fields: Object.keys(input) },
    });
    return toUserDTO(user);
  });

  app.post('/:id/reset-password', async (req, reply) => {
    const me = requireAdmin(req);
    const { id } = parse(idParamsSchema, req.params);
    const input = parse(resetPasswordSchema, req.body);
    if (id === me.id) {
      throw new HttpError(400, 'Per la tua password usa la pagina Profilo', 'USE_PROFILE');
    }

    const found = await prisma.user.findUnique({ where: { id } });
    if (!found) throw notFound('Utente');

    await prisma.user.update({
      where: { id },
      data: { passwordHash: await hashPassword(input.newPassword), mustChangePassword: true },
    });
    await destroyUserSessions(id);
    await audit(req, 'user.password_reset', { entity: 'user', entityId: id });
    return reply.code(204).send();
  });
}
