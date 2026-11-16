import * as SecureStore from 'expo-secure-store';
import type { MeDTO } from '@alby/shared';

/**
 * Credenziali salvate nel Keystore di Android (SharedPreferences cifrate, escluse dal backup).
 * Restano solo su questo telefono e spariscono disinstallando l'app.
 */

const KEYS = { server: 'alby.server', token: 'alby.token', user: 'alby.user' } as const;

export interface StoredSession {
  server: string;
  token: string;
  user: MeDTO;
}

export async function loadStoredSession(): Promise<StoredSession | null> {
  const [server, token, user] = await Promise.all([
    SecureStore.getItemAsync(KEYS.server),
    SecureStore.getItemAsync(KEYS.token),
    SecureStore.getItemAsync(KEYS.user),
  ]);
  if (!server || !token || !user) return null;
  try {
    return { server, token, user: JSON.parse(user) as MeDTO };
  } catch {
    return null;
  }
}

export async function saveStoredSession(session: StoredSession): Promise<void> {
  await SecureStore.setItemAsync(KEYS.server, session.server);
  await SecureStore.setItemAsync(KEYS.token, session.token);
  await SecureStore.setItemAsync(KEYS.user, JSON.stringify(session.user));
}

/** Indirizzo dell'ultimo server usato: resta anche dopo l'uscita, per non riscriverlo. */
export async function loadLastServer(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.server);
}

/** Uscita: via il token e i dati dell'utente (l'indirizzo del server resta). */
export async function clearStoredSession(): Promise<void> {
  await Promise.all([SecureStore.deleteItemAsync(KEYS.token), SecureStore.deleteItemAsync(KEYS.user)]);
}
