import { confirmPasswordSchema, totpCodeSchema, type SecurityStatusDTO, type TotpSetupDTO } from '@alby/shared';
import QRCode from 'qrcode';
import { requireUser } from '../auth/guard';
import { verifyPassword } from '../auth/password';
import { consumeRateLimit } from '../auth/rate-limit';
import {
  decryptTotpSecret,
  encryptTotpSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  isTwoFactorConfigured,
  matchTotpStep,
  totpUri,
} from '../auth/totp';
import type { AuthedContext, RequestContext } from '../context';
import { getPrisma, type User } from '../db';
import { AppError } from '../errors';
import { writeAudit } from './audit';
import { arePasskeysConfigured } from './passkeys';

const FIFTEEN_MIN = 15 * 60 * 1000;
const WRONG_CODE = 'Codice non valido';

async function requirePassword(authed: AuthedContext, raw: unknown): Promise<User> {
  consumeRateLimit(`password:${authed.user.id}`, 10, FIFTEEN_MIN);
  const { password } = confirmPasswordSchema.parse(raw);
  const user = await getPrisma().user.findUniqueOrThrow({ where: { id: authed.user.id } });
  if (!(await verifyPassword(user.passwordHash, password))) {
    throw new AppError(400, 'La password non è corretta', 'WRONG_PASSWORD');
  }
  return user;
}

/** Accetta il codice una volta sola: la condizione nel database regge anche a richieste simultanee. */
async function useTotpCode(user: User, code: string): Promise<boolean> {
  if (!user.totpSecret) return false;
  const step = matchTotpStep(decryptTotpSecret(user.totpSecret, user.id), code);
  if (step === null) return false;
  const { count } = await getPrisma().user.updateMany({
    where: { id: user.id, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] },
    data: { totpLastStep: step },
  });
  return count === 1;
}

async function useRecoveryCode(user: User, code: string): Promise<boolean> {
  const hash = hashRecoveryCode(code);
  if (!user.totpRecoveryHashes.includes(hash)) return false;
  const { count } = await getPrisma().user.updateMany({
    where: { id: user.id, totpRecoveryHashes: { has: hash } },
    data: { totpRecoveryHashes: user.totpRecoveryHashes.filter((h) => h !== hash) },
  });
  return count === 1;
}

/** Secondo passaggio del login: `code` è il codice a 6 cifre oppure un codice di recupero. */
export async function verifySecondFactor(ctx: RequestContext, user: User, code: string | undefined): Promise<void> {
  if (!user.totpEnabledAt) return;
  if (!code) throw new AppError(401, 'Inserisci il codice di verifica', 'TWO_FACTOR_REQUIRED');
  consumeRateLimit(`2fa:${user.id}`, 10, FIFTEEN_MIN);

  const isTotp = /^\d{6}$/.test(code);
  if (await (isTotp ? useTotpCode(user, code) : useRecoveryCode(user, code))) {
    if (!isTotp) await writeAudit(ctx, 'auth.recovery_code_used', { userId: user.id });
    return;
  }
  await writeAudit(ctx, 'auth.login_failed', { userId: user.id, details: { reason: 'codice di verifica errato' } });
  throw new AppError(401, WRONG_CODE, 'INVALID_TWO_FACTOR');
}

export async function getSecurityStatus(ctx: RequestContext): Promise<SecurityStatusDTO> {
  const { user: me } = requireUser(ctx);
  const user = await getPrisma().user.findUniqueOrThrow({
    where: { id: me.id },
    select: {
      totpEnabledAt: true,
      totpRecoveryHashes: true,
      passkeys: { orderBy: { createdAt: 'desc' } },
    },
  });
  return {
    twoFactorAvailable: isTwoFactorConfigured(),
    twoFactorEnabled: user.totpEnabledAt !== null,
    recoveryCodesLeft: user.totpRecoveryHashes.length,
    passkeysAvailable: arePasskeysConfigured(),
    passkeys: user.passkeys.map((p) => ({
      id: p.id,
      name: p.name,
      createdAt: p.createdAt.toISOString(),
      lastUsedAt: p.lastUsedAt?.toISOString() ?? null,
    })),
  };
}

/** Primo passo: prepara un segreto, che diventa attivo solo dopo la conferma con un codice. */
export async function beginTotpSetup(ctx: RequestContext, raw: unknown): Promise<TotpSetupDTO> {
  const authed = requireUser(ctx);
  const user = await requirePassword(authed, raw);
  if (user.totpEnabledAt) throw new AppError(409, 'La verifica in due passaggi è già attiva', 'TWO_FACTOR_ACTIVE');

  const secret = generateTotpSecret();
  await getPrisma().user.update({
    where: { id: user.id },
    data: { totpSecret: encryptTotpSecret(secret, user.id), totpLastStep: null, totpRecoveryHashes: [] },
  });
  const uri = totpUri(secret, user.email);
  return { secret, uri, qrSvg: await QRCode.toString(uri, { type: 'svg', errorCorrectionLevel: 'M', margin: 2 }) };
}

/** Secondo passo: il codice dimostra che l'app è configurata. I codici di recupero si vedono solo qui. */
export async function confirmTotpSetup(ctx: RequestContext, raw: unknown): Promise<{ recoveryCodes: string[] }> {
  const { user: me } = requireUser(ctx);
  consumeRateLimit(`2fa:${me.id}`, 10, FIFTEEN_MIN);
  const { code } = totpCodeSchema.parse(raw);
  const prisma = getPrisma();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
  if (user.totpEnabledAt) throw new AppError(409, 'La verifica in due passaggi è già attiva', 'TWO_FACTOR_ACTIVE');
  if (!user.totpSecret) throw new AppError(400, 'Ricomincia la configurazione', 'TWO_FACTOR_NOT_STARTED');
  if (!(await useTotpCode(user, code))) throw new AppError(400, WRONG_CODE, 'INVALID_TWO_FACTOR');

  const recoveryCodes = generateRecoveryCodes();
  await prisma.user.update({
    where: { id: user.id },
    data: { totpEnabledAt: new Date(), totpRecoveryHashes: recoveryCodes.map(hashRecoveryCode) },
  });
  await writeAudit(ctx, 'auth.two_factor_enabled');
  return { recoveryCodes };
}

const TOTP_CLEARED = { totpSecret: null, totpEnabledAt: null, totpLastStep: null, totpRecoveryHashes: [] };

export async function disableTotp(ctx: RequestContext, raw: unknown): Promise<void> {
  const user = await requirePassword(requireUser(ctx), raw);
  await getPrisma().user.update({ where: { id: user.id }, data: TOTP_CLEARED });
  await writeAudit(ctx, 'auth.two_factor_disabled');
}

/** Per l'amministratore: chi ha perso telefono e codici può rientrare con la sola password. */
export async function clearUserSecondFactors(userId: string): Promise<void> {
  const prisma = getPrisma();
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: TOTP_CLEARED }),
    prisma.passkey.deleteMany({ where: { userId } }),
  ]);
}
