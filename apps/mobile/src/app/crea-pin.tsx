import { KeyRound } from 'lucide-react-native';
import { useState } from 'react';
import { Alert } from 'react-native';
import { biometricsAvailable, declineLock, setPin } from '@/lib/app-lock';
import { useSession } from '@/lib/session';
import { LockLink, LockScreen, PinSetup } from '@/ui/lock-screen';

/** Si chiede se usare anche l'impronta (solo se il telefono ce l'ha). */
async function askBiometrics(): Promise<boolean> {
  if (!(await biometricsAvailable())) return false;
  return new Promise((resolve) =>
    Alert.alert('Usare anche l’impronta?', 'Potrai sbloccare l’app con l’impronta o il volto; il PIN resta come alternativa.', [
      { text: 'No, solo PIN', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Sì', onPress: () => resolve(true) },
    ]),
  );
}

/** Dopo l'accesso: scelta del PIN dell'app (si può rinunciare; il blocco si riattiva da Account → Sicurezza). */
export default function CreatePinScreen() {
  const { unlocked } = useSession();
  const [confirming, setConfirming] = useState(false);

  const skip = () =>
    Alert.alert(
      'Continuare senza blocco?',
      'Chiunque usi il telefono potrà aprire l’app e vedere i dati sanitari. Puoi attivare il blocco in seguito da Account → Sicurezza.',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Continua senza',
          style: 'destructive',
          onPress: () => void declineLock().then(unlocked),
        },
      ],
    );

  return (
    <LockScreen
      icon={KeyRound}
      title={confirming ? 'Conferma il PIN' : 'Proteggi l’app'}
      subtitle={confirming ? 'Scrivi di nuovo le 6 cifre' : 'Scegli un PIN di 6 cifre: servirà per aprire l’app'}
      footer={<LockLink title="Continua senza blocco" onPress={skip} />}
    >
      <PinSetup
        onStepChange={setConfirming}
        onDone={async (pin) => {
          await setPin(pin, { biometrics: await askBiometrics() });
          unlocked();
        }}
      />
    </LockScreen>
  );
}
