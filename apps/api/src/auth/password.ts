import { hash, verify } from '@node-rs/argon2';

// Argon2id con i parametri minimi raccomandati da OWASP.
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * Esegue una verifica "a vuoto" quando l'utente non esiste, così il tempo di risposta
 * non rivela quali email sono registrate.
 */
export async function simulatePasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword('password-fittizia-per-uniformare-i-tempi');
  await verifyPassword(await dummyHash, password);
}
