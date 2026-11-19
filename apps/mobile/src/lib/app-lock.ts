import * as Crypto from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

/**
 * Blocco dell'app: un PIN dell'app (6 cifre, sul tastierino disegnato dall'app) e, se l'utente lo vuole,
 * impronta o volto. Di Android si vede solo il pannello del sensore biometrico (nessuna app può sostituirlo),
 * mai il PIN o la sequenza del telefono.
 *
 * Il PIN non si salva: nel Keystore (SecureStore) c'è solo il suo hash con un sale casuale. Dopo
 * `FREE_ATTEMPTS` errori si aspetta sempre di più; al `MAX_ATTEMPTS`-esimo si esce dall'account
 * (cancellando la copia locale), perché sul telefono ci sono dati sanitari.
 */

export const PIN_LENGTH = 6;
const FREE_ATTEMPTS = 4;
export const MAX_ATTEMPTS = 10;
const KEY = 'alby.applock';
const HASH_ROUNDS = 2000;

export interface LockSettings {
  enabled: boolean;
  biometrics: boolean;
  pinHash: string | null;
  salt: string | null;
  failures: number;
  /** Fino a quando (ms) non si può riprovare. */
  waitUntil: number;
}

const DEFAULTS: LockSettings = { enabled: false, biometrics: false, pinHash: null, salt: null, failures: 0, waitUntil: 0 };

export async function getLockSettings(): Promise<LockSettings> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<LockSettings>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

async function save(next: LockSettings) {
  await SecureStore.setItemAsync(KEY, JSON.stringify(next));
}

async function hashPin(pin: string, salt: string): Promise<string> {
  let h = `${salt}:${pin}`;
  for (let i = 0; i < HASH_ROUNDS; i++) h = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}${h}`);
  return h;
}

/** Il blocco è configurato (PIN scelto) ma l'app non è ancora stata sbloccata. */
export const isLockActive = (s: LockSettings) => s.enabled && !!s.pinHash;

/** Nuovo PIN (attiva il blocco). */
export async function setPin(pin: string, opts: { biometrics: boolean }): Promise<void> {
  const bytes = await Crypto.getRandomBytesAsync(16);
  const salt = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  const current = await getLockSettings();
  await save({ ...current, enabled: true, biometrics: opts.biometrics, salt, pinHash: await hashPin(pin, salt), failures: 0, waitUntil: 0 });
}

/** Disattiva il blocco: il PIN si dimentica e non viene più proposto (si riattiva dalle impostazioni). */
export async function disableLock(): Promise<void> {
  await declineLock();
}

export async function setBiometricsEnabled(biometrics: boolean): Promise<void> {
  await save({ ...(await getLockSettings()), biometrics });
}

/** Il blocco è stato proposto e rifiutato ("Continua senza blocco"): non va riproposto. */
export async function declineLock(): Promise<void> {
  await save({ ...DEFAULTS, enabled: false, pinHash: null, salt: '' });
}

/** Dopo l'accesso si chiede di scegliere un PIN, a meno che l'utente non abbia già scelto o rifiutato. */
export const needsLockSetup = (s: LockSettings) => !s.pinHash && s.salt === null;

export async function clearLock(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY).catch(() => {});
}

export type PinCheck =
  | { ok: true }
  | { ok: false; reason: 'wrong'; attemptsLeft: number; waitMs: number }
  | { ok: false; reason: 'wait'; waitMs: number }
  | { ok: false; reason: 'exhausted' };

/** Attesa dopo l'n-esimo errore: nessuna per i primi, poi 30 s, 1, 2, 4… minuti (al massimo un'ora). */
const waitAfter = (failures: number) => (failures <= FREE_ATTEMPTS ? 0 : Math.min(30_000 * 2 ** (failures - FREE_ATTEMPTS - 1), 3_600_000));

export async function verifyPin(pin: string): Promise<PinCheck> {
  const s = await getLockSettings();
  const now = Date.now();
  if (s.waitUntil > now) return { ok: false, reason: 'wait', waitMs: s.waitUntil - now };
  if (s.pinHash && s.salt && (await hashPin(pin, s.salt)) === s.pinHash) {
    await save({ ...s, failures: 0, waitUntil: 0 });
    return { ok: true };
  }
  const failures = s.failures + 1;
  if (failures >= MAX_ATTEMPTS) return { ok: false, reason: 'exhausted' };
  const waitMs = waitAfter(failures);
  await save({ ...s, failures, waitUntil: waitMs ? now + waitMs : 0 });
  return { ok: false, reason: 'wrong', attemptsLeft: MAX_ATTEMPTS - failures, waitMs };
}

/** Impronta o volto disponibili (sensore presente e almeno un dato registrato). */
export async function biometricsAvailable(): Promise<boolean> {
  try {
    return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
  } catch {
    return false;
  }
}

/** Pannello del sensore, senza il ripiego su PIN / sequenza di Android (il ripiego è il PIN dell'app). */
export async function unlockWithBiometrics(): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Sblocca Cartelle Cliniche',
      cancelLabel: 'Usa il PIN',
      disableDeviceFallback: true,
      biometricsSecurityLevel: 'strong',
    });
    if (result.success) {
      const s = await getLockSettings();
      await save({ ...s, failures: 0, waitUntil: 0 });
    }
    return result.success;
  } catch {
    return false;
  }
}
