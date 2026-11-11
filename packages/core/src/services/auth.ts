import { changePasswordSchema, loginSchema, setupSchema } from '@alby/shared';
import { requireUser } from '../auth/guard';
import { hashPassword, simulatePasswordCheck, verifyPassword } from '../auth/password';
import { consumeRateLimit } from '../auth/rate-limit';
import { createSession, destroySession, destroyUserSessions, toAuthUser } from '../auth/session';
import type { AuthUser, RequestContext } from '../context';
import { getPrisma } from '../db';
import { AppError } from '../errors';
import { writeAudit } from './audit';

const INVALID_CREDENTIALS = 'Email o password non corretti';
const FIFTEEN_MIN = 15 * 60 * 1000;

export interface SignedIn {
  user: AuthUser;
  token: string;
  expiresAt: Date;
}

export async function needsSetup(): Promise<boolean> {
  return (await getPrisma().user.count()) === 0;
}

/** Primo avvio: crea l'amministratore, solo se non esiste ancora nessun utente. */
export async function setupAdmin(ctx: RequestContext, raw: unknown): Promise<SignedIn> {
  consumeRateLimit(`setup:${ctx.ip}`, 5, FIFTEEN_MIN);
  const input = setupSchema.parse(raw);
  const passwordHash = await hashPassword(input.password);

  const user = await getPrisma().$transaction(async (tx) => {
    // Il lock evita che due richieste simultanee creino due amministratori.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(724001)`;
    if ((await tx.user.count()) > 0) {
      throw new AppError(409, 'La configurazione iniziale è già stata completata', 'SETUP_DONE');
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

  const session = await createSession(user.id, ctx);
  await writeAudit(ctx, 'setup.admin_created', { userId: user.id, entity: 'user', entityId: user.id });
  return { user: toAuthUser(user), ...session };
}

export async function login(ctx: RequestContext, raw: unknown, client: 'web' | 'mobile'): Promise<SignedIn> {
  consumeRateLimit(`login:${ctx.ip}`, 10, FIFTEEN_MIN);
  const input = loginSchema.parse(raw);
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { email: input.email } });

  if (!user) {
    await simulatePasswordCheck(input.password);
    await writeAudit(ctx, 'auth.login_failed', { userId: null, details: { email: input.email } });
    throw new AppError(401, INVALID_CREDENTIALS, 'INVALID_CREDENTIALS');
  }
  const ok = await verifyPassword(user.passwordHash, input.password);
  if (!ok || !user.active) {
    await writeAudit(ctx, 'auth.login_failed', {
      userId: user.id,
      details: { reason: ok ? 'utente disattivato' : 'password errata' },
    });
    throw new AppError(401, INVALID_CREDENTIALS, 'INVALID_CREDENTIALS');
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  const session = await createSession(user.id, ctx);
  await writeAudit(ctx, 'auth.login', { userId: user.id, details: { client } });
  return { user: toAuthUser(user), ...session };
}

export async function logout(ctx: RequestContext) {
  if (!ctx.sessionId) return;
  await destroySession(ctx.sessionId);
  await writeAudit(ctx, 'auth.logout');
}

export async function changePassword(ctx: RequestContext, raw: unknown): Promise<AuthUser> {
  const authed = requireUser(ctx, { allowPendingPasswordChange: true });
  consumeRateLimit(`password:${authed.user.id}`, 10, FIFTEEN_MIN);
  const input = changePasswordSchema.parse(raw);
  const prisma = getPrisma();

  const user = await prisma.user.findUniqueOrThrow({ where: { id: authed.user.id } });
  if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
    throw new AppError(400, 'La password attuale non è corretta', 'WRONG_PASSWORD');
  }
  if (input.currentPassword === input.newPassword) {
    throw new AppError(400, 'La nuova password deve essere diversa da quella attuale', 'SAME_PASSWORD');
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(input.newPassword), mustChangePassword: false },
  });
  // Le altre sessioni (altri dispositivi) vengono chiuse.
  await destroyUserSessions(user.id, ctx.sessionId);
  await writeAudit(ctx, 'auth.password_changed');
  return toAuthUser(updated);
}
