import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { getConfig } from '../config';
import { AppError } from '../errors';

/** Codici a 6 cifre ogni 30 secondi con SHA-1: il formato che tutte le app di autenticazione capiscono (RFC 6238). */
const PERIOD_SECONDS = 30;
const DIGITS = 6;
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    value &= (1 << bits) - 1;
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(text: string): Buffer {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of text) {
    value = (value << 5) | BASE32.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
    value &= (1 << bits) - 1;
  }
  return Buffer.from(out);
}

export const generateTotpSecret = () => base32Encode(randomBytes(20));

export function totpCode(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = mac[mac.length - 1]! & 15;
  return String((mac.readUInt32BE(offset) & 0x7fffffff) % 10 ** DIGITS).padStart(DIGITS, '0');
}

export const currentTotpStep = (now = Date.now()) => Math.floor(now / 1000 / PERIOD_SECONDS);

/** Restituisce l'intervallo a cui appartiene il codice (tollera 30 secondi di differenza tra gli orologi). */
export function matchTotpStep(secret: string, code: string, now = Date.now()): number | null {
  const given = Buffer.from(code);
  const current = currentTotpStep(now);
  let match: number | null = null;
  for (const step of [current - 1, current, current + 1]) {
    const expected = Buffer.from(totpCode(secret, step));
    if (given.length === expected.length && timingSafeEqual(given, expected)) match = step;
  }
  return match;
}

export function totpUri(secret: string, email: string): string {
  const issuer = 'Cartelle Cliniche';
  const params = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: String(DIGITS), period: String(PERIOD_SECONDS) });
  return `otpauth://totp/${encodeURIComponent(`${issuer}:${email}`)}?${params}`;
}

// ---------------------------------------------------------------- codici di recupero

/** Maiuscolo, senza trattini o spazi: il codice si può digitare come capita. */
const normalizeRecoveryCode = (code: string) => code.toUpperCase().replace(/[^A-Z2-7]/g, '');

export const hashRecoveryCode = (code: string) => createHash('sha256').update(normalizeRecoveryCode(code)).digest('hex');

/** 80 bit casuali per codice, mostrati a gruppi di quattro caratteri. */
export const generateRecoveryCodes = (count = 10) =>
  Array.from({ length: count }, () => base32Encode(randomBytes(10)).match(/.{4}/g)!.join('-'));

// ---------------------------------------------------------------- cifratura del segreto

export const isTwoFactorConfigured = () => Boolean(getConfig().TWO_FACTOR_KEY);

function encryptionKey(): Buffer {
  const secret = getConfig().TWO_FACTOR_KEY;
  if (!secret) {
    throw new AppError(503, 'La verifica in due passaggi non è configurata su questo server', 'TWO_FACTOR_UNAVAILABLE');
  }
  return Buffer.from(hkdfSync('sha256', secret, '', 'alby-totp-v1', 32));
}

/** Il segreto è legato all'utente: copiato su un altro account non si decifra. */
export function encryptTotpSecret(secret: string, userId: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv).setAAD(Buffer.from(userId));
  const data = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
}

export function decryptTotpSecret(stored: string, userId: string): string {
  const [, iv, tag, data] = stored.split('.');
  try {
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv!, 'base64url'))
      .setAAD(Buffer.from(userId))
      .setAuthTag(Buffer.from(tag!, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data!, 'base64url')), decipher.final()]).toString('utf8');
  } catch (err) {
    if (err instanceof AppError) throw err;
    // Succede se TWO_FACTOR_KEY è cambiata: restano validi i codici di recupero.
    throw new AppError(503, 'Codice non verificabile: usa un codice di recupero', 'TWO_FACTOR_KEY_MISMATCH');
  }
}
