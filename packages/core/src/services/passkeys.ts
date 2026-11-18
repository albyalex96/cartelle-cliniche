import { isIP } from 'node:net';
import { idSchema, passkeyLoginSchema, passkeyRegisterSchema, type PasskeyOptionsDTO } from '@alby/shared';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransport,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { requireUser } from '../auth/guard';
import { consumeRateLimit } from '../auth/rate-limit';
import { getConfig } from '../config';
import type { RequestContext } from '../context';
import { getPrisma, type User } from '../db';
import { AppError, notFound } from '../errors';
import { writeAudit } from './audit';

const FIFTEEN_MIN = 15 * 60 * 1000;
const CHALLENGE_MS = 5 * 60 * 1000;
const MAX_PASSKEYS = 10;
const LOGIN_FAILED = 'Accesso con passkey non riuscito';

type Purpose = 'register' | 'login';

/** Dominio delle passkey. Un indirizzo IP non è ammesso da WebAuthn. */
function relyingParty(): { origin: string; rpID: string } | null {
  const { APP_URL, isProduction } = getConfig();
  const raw = APP_URL ?? (isProduction ? null : 'http://localhost:3000');
  if (!raw) return null;
  const url = new URL(raw);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) return null;
  if (url.protocol !== 'https:' && host !== 'localhost') return null;
  return { origin: url.origin, rpID: host };
}

export const arePasskeysConfigured = () => relyingParty() !== null;

function requireRelyingParty() {
  const rp = relyingParty();
  if (!rp) throw new AppError(503, 'Le passkey non sono configurate su questo server', 'PASSKEYS_UNAVAILABLE');
  return rp;
}

async function saveChallenge(challenge: string, purpose: Purpose, userId: string | null) {
  const prisma = getPrisma();
  await prisma.webauthnChallenge.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await prisma.webauthnChallenge.create({
    data: { challenge, purpose, userId, expiresAt: new Date(Date.now() + CHALLENGE_MS) },
  });
}

/** Cancellandola, la sfida si può usare una volta sola anche con richieste simultanee. */
async function takeChallenge(challenge: string, purpose: Purpose, userId: string | null): Promise<boolean> {
  const { count } = await getPrisma().webauthnChallenge.deleteMany({
    where: { challenge, purpose, userId, expiresAt: { gt: new Date() } },
  });
  return count === 1;
}

export async function beginPasskeyRegistration(ctx: RequestContext): Promise<PasskeyOptionsDTO> {
  const { user } = requireUser(ctx);
  consumeRateLimit(`passkey:${user.id}`, 20, FIFTEEN_MIN);
  const { rpID } = requireRelyingParty();
  const existing = await getPrisma().passkey.findMany({ where: { userId: user.id } });
  if (existing.length >= MAX_PASSKEYS) throw new AppError(400, `Puoi registrare al massimo ${MAX_PASSKEYS} passkey`, 'TOO_MANY_PASSKEYS');

  const options = await generateRegistrationOptions({
    rpName: 'Cartelle Cliniche',
    rpID,
    userID: Buffer.from(user.id),
    userName: user.email,
    userDisplayName: user.displayName,
    attestationType: 'none',
    excludeCredentials: existing.map((p) => ({
      id: p.credentialId,
      transports: p.transports as AuthenticatorTransport[],
    })),
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
  });
  await saveChallenge(options.challenge, 'register', user.id);
  return { challenge: options.challenge, options };
}

export async function finishPasskeyRegistration(ctx: RequestContext, raw: unknown): Promise<void> {
  const { user } = requireUser(ctx);
  consumeRateLimit(`passkey:${user.id}`, 20, FIFTEEN_MIN);
  const { origin, rpID } = requireRelyingParty();
  const input = passkeyRegisterSchema.parse(raw);
  const failed = new AppError(400, 'Registrazione della passkey non riuscita', 'PASSKEY_FAILED');
  if (!(await takeChallenge(input.challenge, 'register', user.id))) throw failed;

  const result = await verifyRegistrationResponse({
    response: input.response as unknown as RegistrationResponseJSON,
    expectedChallenge: input.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
  }).catch(() => null);
  if (!result?.verified || !result.registrationInfo) throw failed;

  const { credential } = result.registrationInfo;
  const passkey = await getPrisma().passkey.create({
    data: {
      userId: user.id,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey),
      counter: BigInt(credential.counter),
      transports: credential.transports ?? [],
      name: input.name,
    },
  });
  await writeAudit(ctx, 'auth.passkey_added', { entity: 'passkey', entityId: passkey.id });
}

export async function deletePasskey(ctx: RequestContext, rawId: unknown): Promise<void> {
  const { user } = requireUser(ctx);
  const id = idSchema.parse(rawId);
  const { count } = await getPrisma().passkey.deleteMany({ where: { id, userId: user.id } });
  if (count === 0) throw notFound('Passkey');
  await writeAudit(ctx, 'auth.passkey_removed', { entity: 'passkey', entityId: id });
}

export async function beginPasskeyLogin(ctx: RequestContext): Promise<PasskeyOptionsDTO> {
  consumeRateLimit(`passkey-login:${ctx.ip}`, 20, FIFTEEN_MIN);
  const { rpID } = requireRelyingParty();
  const options = await generateAuthenticationOptions({ rpID, userVerification: 'required' });
  await saveChallenge(options.challenge, 'login', null);
  return { challenge: options.challenge, options };
}

/** Verifica la passkey e restituisce il suo proprietario. L'impronta o il PIN valgono come secondo fattore. */
export async function verifyPasskeyLogin(ctx: RequestContext, raw: unknown): Promise<User> {
  consumeRateLimit(`passkey-login:${ctx.ip}`, 20, FIFTEEN_MIN);
  const { origin, rpID } = requireRelyingParty();
  const input = passkeyLoginSchema.parse(raw);
  const failed = new AppError(401, LOGIN_FAILED, 'PASSKEY_FAILED');
  if (!(await takeChallenge(input.challenge, 'login', null))) throw failed;

  const prisma = getPrisma();
  const passkey = await prisma.passkey.findUnique({
    where: { credentialId: input.response.id },
    include: { user: true },
  });
  if (!passkey) {
    await writeAudit(ctx, 'auth.login_failed', { userId: null, details: { reason: 'passkey sconosciuta' } });
    throw failed;
  }

  const result = await verifyAuthenticationResponse({
    response: input.response as unknown as AuthenticationResponseJSON,
    expectedChallenge: input.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
    credential: {
      id: passkey.credentialId,
      publicKey: new Uint8Array(passkey.publicKey),
      counter: Number(passkey.counter),
      transports: passkey.transports as AuthenticatorTransport[],
    },
  }).catch(() => null);
  if (!result?.verified || !passkey.user.active) {
    await writeAudit(ctx, 'auth.login_failed', { userId: passkey.userId, details: { reason: 'passkey non valida' } });
    throw failed;
  }

  await prisma.passkey.update({
    where: { id: passkey.id },
    data: { counter: BigInt(result.authenticationInfo.newCounter), lastUsedAt: new Date() },
  });
  return passkey.user;
}
