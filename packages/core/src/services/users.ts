import {
  idSchema,
  resetPasswordSchema,
  userCreateSchema,
  userUpdateSchema,
  type AccessEntry,
  type UserDTO,
} from '@alby/shared';
import { requireAdmin } from '../auth/guard';
import { hashPassword } from '../auth/password';
import { destroyUserSessions } from '../auth/session';
import type { RequestContext } from '../context';
import { getPrisma, Prisma, type Patient, type PatientAccess, type User } from '../db';
import { AppError, notFound } from '../errors';
import { writeAudit } from './audit';

const withAccess = { patientAccess: { include: { patient: true } } } satisfies Prisma.UserInclude;

type UserWithAccess = User & { patientAccess: (PatientAccess & { patient: Patient })[] };

export function toUserDTO(u: UserWithAccess): UserDTO {
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    role: u.role,
    active: u.active,
    mustChangePassword: u.mustChangePassword,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
    access: u.patientAccess
      .map((a) => ({
        patientId: a.patientId,
        patientName: `${a.patient.lastName} ${a.patient.firstName}`,
        canEdit: a.canEdit,
      }))
      .sort((a, b) => a.patientName.localeCompare(b.patientName, 'it')),
  };
}

/** Elimina doppioni (vince l'ultima voce) e verifica che i pazienti esistano. */
async function normalizeAccess(entries: AccessEntry[]) {
  const unique = [...new Map(entries.map((e) => [e.patientId, e])).values()];
  if (unique.length === 0) return unique;
  const found = await getPrisma().patient.count({ where: { id: { in: unique.map((e) => e.patientId) } } });
  if (found !== unique.length) throw new AppError(400, 'Uno o più pazienti selezionati non esistono', 'BAD_PATIENT');
  return unique;
}

export async function listUsers(ctx: RequestContext): Promise<UserDTO[]> {
  requireAdmin(ctx);
  const users = await getPrisma().user.findMany({ include: withAccess, orderBy: { displayName: 'asc' } });
  return users.map(toUserDTO);
}

export async function createUser(ctx: RequestContext, raw: unknown): Promise<UserDTO> {
  requireAdmin(ctx);
  const input = userCreateSchema.parse(raw);
  const access = input.role === 'ADMIN' ? [] : await normalizeAccess(input.access);

  const user = await getPrisma().user.create({
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
  await writeAudit(ctx, 'user.created', {
    entity: 'user',
    entityId: user.id,
    details: { email: user.email, role: user.role },
  });
  return toUserDTO(user);
}

export async function updateUser(ctx: RequestContext, rawId: unknown, raw: unknown): Promise<UserDTO> {
  const { user: me } = requireAdmin(ctx);
  const id = idSchema.parse(rawId);
  const input = userUpdateSchema.parse(raw);
  const prisma = getPrisma();

  const current = await prisma.user.findUnique({ where: { id } });
  if (!current) throw notFound('Utente');

  const losesAdmin =
    current.role === 'ADMIN' && ((input.role !== undefined && input.role !== 'ADMIN') || input.active === false);
  if (losesAdmin) {
    if (id === me.id) {
      throw new AppError(400, 'Non puoi rimuovere i permessi di amministratore a te stesso', 'SELF_DEMOTE');
    }
    const otherAdmins = await prisma.user.count({ where: { role: 'ADMIN', active: true, id: { not: id } } });
    if (otherAdmins === 0) throw new AppError(400, 'Deve restare almeno un amministratore attivo', 'LAST_ADMIN');
  }

  const role = input.role ?? current.role;
  const access = role === 'ADMIN' ? [] : input.access !== undefined ? await normalizeAccess(input.access) : undefined;

  const user = await prisma.$transaction(async (tx) => {
    if (access !== undefined) {
      await tx.patientAccess.deleteMany({ where: { userId: id } });
      if (access.length) await tx.patientAccess.createMany({ data: access.map((a) => ({ ...a, userId: id })) });
    }
    return tx.user.update({
      where: { id },
      data: { displayName: input.displayName, email: input.email, role: input.role, active: input.active },
      include: withAccess,
    });
  });

  if (input.active === false || (input.role && input.role !== current.role)) {
    await destroyUserSessions(id);
  }
  await writeAudit(ctx, 'user.updated', { entity: 'user', entityId: id, details: { fields: Object.keys(input) } });
  return toUserDTO(user);
}

export async function resetUserPassword(ctx: RequestContext, rawId: unknown, raw: unknown): Promise<void> {
  const { user: me } = requireAdmin(ctx);
  const id = idSchema.parse(rawId);
  const input = resetPasswordSchema.parse(raw);
  if (id === me.id) throw new AppError(400, 'Per la tua password usa la pagina Profilo', 'USE_PROFILE');

  const prisma = getPrisma();
  const found = await prisma.user.findUnique({ where: { id } });
  if (!found) throw notFound('Utente');

  await prisma.user.update({
    where: { id },
    data: { passwordHash: await hashPassword(input.newPassword), mustChangePassword: true },
  });
  await destroyUserSessions(id);
  await writeAudit(ctx, 'user.password_reset', { entity: 'user', entityId: id });
}

/** Chiude tutte le sessioni (web e app) di un altro utente, senza toccare password o permessi. */
export async function closeUserSessions(ctx: RequestContext, rawId: unknown): Promise<{ closed: number }> {
  const { user: me } = requireAdmin(ctx);
  const id = idSchema.parse(rawId);
  if (id === me.id) throw new AppError(400, 'Per uscire dalle tue sessioni usa il logout', 'USE_LOGOUT');

  const found = await getPrisma().user.findUnique({ where: { id }, select: { id: true } });
  if (!found) throw notFound('Utente');

  const closed = await destroyUserSessions(id);
  await writeAudit(ctx, 'user.sessions_closed', { entity: 'user', entityId: id, details: { closed } });
  return { closed };
}
