import * as LocalAuthentication from 'expo-local-authentication';

/**
 * Sblocco dell'app con impronta, volto o, in alternativa, con PIN / sequenza del telefono.
 * Sono dati sanitari: senza un blocco schermo impostato sul telefono l'app non si usa.
 */

export type UnlockResult = { ok: true } | { ok: false; reason: 'no-device-lock' | 'cancelled' | 'failed'; message: string };

export const NO_DEVICE_LOCK_MESSAGE =
  'Sul telefono non c’è un blocco schermo. Imposta un PIN, una sequenza o l’impronta nelle impostazioni di Android, poi riprova.';

export async function hasDeviceLock(): Promise<boolean> {
  return (await LocalAuthentication.getEnrolledLevelAsync()) !== LocalAuthentication.SecurityLevel.NONE;
}

export async function unlockWithDevice(): Promise<UnlockResult> {
  if (!(await hasDeviceLock())) return { ok: false, reason: 'no-device-lock', message: NO_DEVICE_LOCK_MESSAGE };
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Sblocca Cartelle Cliniche',
    promptSubtitle: 'Usa l’impronta, il volto o il PIN del telefono',
    cancelLabel: 'Annulla',
  });
  if (result.success) return { ok: true };
  switch (result.error) {
    case 'user_cancel':
    case 'system_cancel':
    case 'app_cancel':
      return { ok: false, reason: 'cancelled', message: 'Sblocco annullato.' };
    case 'not_enrolled':
    case 'passcode_not_set':
      return { ok: false, reason: 'no-device-lock', message: NO_DEVICE_LOCK_MESSAGE };
    case 'lockout':
      return { ok: false, reason: 'failed', message: 'Troppi tentativi. Riprova tra qualche istante.' };
    default:
      return { ok: false, reason: 'failed', message: 'Sblocco non riuscito. Riprova.' };
  }
}
