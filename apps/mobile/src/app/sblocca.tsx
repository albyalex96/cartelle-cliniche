import { Fingerprint, Lock } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { biometricsAvailable, getLockSettings, MAX_ATTEMPTS, unlockWithBiometrics, verifyPin } from '@/lib/app-lock';
import { useSession } from '@/lib/session';
import { LockLink, LockScreen } from '@/ui/lock-screen';
import { PinPad } from '@/ui/pin-pad';

/**
 * Sblocco dell'app, disegnato dall'app: PIN sul tastierino e, se attivata, impronta o volto (di Android
 * compare solo il pannello del sensore). Troppi PIN errati → uscita dall'account.
 */
export default function UnlockScreen() {
  const { unlocked, signOut, user } = useSession();
  const [biometrics, setBiometrics] = useState(false);
  const [waitUntil, setWaitUntil] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const asked = useRef(false);

  const tryBiometrics = useCallback(async () => {
    if (await unlockWithBiometrics()) unlocked();
  }, [unlocked]);

  // All'apertura: impostazioni del blocco e, se attiva, subito la richiesta dell'impronta (una volta sola).
  useEffect(() => {
    void (async () => {
      const s = await getLockSettings();
      setWaitUntil(s.waitUntil);
      const enabled = s.biometrics && (await biometricsAvailable());
      setBiometrics(enabled);
      if (enabled && !asked.current) {
        asked.current = true;
        void tryBiometrics();
      }
    })();
  }, [tryBiometrics]);

  const confirmSignOut = () =>
    Alert.alert('Uscire dall’account?', 'I dati salvati sul telefono verranno cancellati. Per rientrare serviranno email e password.', [
      { text: 'Annulla', style: 'cancel' },
      { text: 'Esci', style: 'destructive', onPress: () => void signOut() },
    ]);

  const firstName = user?.displayName.split(' ')[0];
  return (
    <LockScreen
      icon={Lock}
      title={firstName ? `Bentornato, ${firstName}` : 'App bloccata'}
      subtitle={biometrics ? 'Inserisci il PIN o usa l’impronta' : 'Inserisci il PIN dell’app'}
      footer={<LockLink title="Esci dall’account" onPress={confirmSignOut} />}
    >
      <PinPad
        message={message}
        waitUntil={waitUntil}
        biometric={biometrics ? { icon: Fingerprint, label: 'Sblocca con l’impronta', onPress: () => void tryBiometrics() } : null}
        onComplete={async (pin) => {
          const check = await verifyPin(pin);
          if (check.ok) {
            setMessage(null);
            unlocked();
            return true;
          }
          if (check.reason === 'exhausted') {
            Alert.alert('Troppi tentativi', `Hai sbagliato il PIN ${MAX_ATTEMPTS} volte: per sicurezza esci dall’account e i dati sul telefono vengono cancellati.`);
            await signOut();
            return false;
          }
          if (check.waitMs) setWaitUntil(Date.now() + check.waitMs);
          setMessage(
            check.reason === 'wrong'
              ? check.attemptsLeft <= 5
                ? `PIN errato. Ancora ${check.attemptsLeft} ${check.attemptsLeft === 1 ? 'tentativo' : 'tentativi'} prima dell’uscita dall’account`
                : 'PIN errato'
              : null,
          );
          return false;
        }}
      />
    </LockScreen>
  );
}
