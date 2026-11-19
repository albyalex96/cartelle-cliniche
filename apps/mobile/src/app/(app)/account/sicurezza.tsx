import { Stack } from 'expo-router';
import { KeyRound, Lock, LockOpen } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import {
  biometricsAvailable,
  disableLock,
  getLockSettings,
  isLockActive,
  setBiometricsEnabled,
  setPin,
  unlockWithBiometrics,
  verifyPin,
  type LockSettings,
} from '@/lib/app-lock';
import { Card, Row } from '@/ui/blocks';
import { LockScreen, PinSetup } from '@/ui/lock-screen';
import { PinPad } from '@/ui/pin-pad';
import { useBottomSpace } from '@/ui/tab-bar';
import { spacing, useTheme } from '@/ui/theme';

/** Cosa si sta facendo nella finestra del PIN. */
type Flow = null | { kind: 'enable' } | { kind: 'disable' } | { kind: 'change'; verified: boolean };

function SwitchRow({ title, subtitle, value, onChange, disabled }: { title: string; subtitle: string; value: boolean; onChange(v: boolean): void; disabled?: boolean }) {
  const t = useTheme();
  return (
    <View style={[styles.switchRow, { opacity: disabled ? 0.5 : 1 }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: t.text, fontSize: 16, fontWeight: '600' }}>{title}</Text>
        <Text style={{ color: t.muted, fontSize: 14 }}>{subtitle}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} disabled={disabled} trackColor={{ true: t.primary }} />
    </View>
  );
}

/** PIN attuale, per disattivare il blocco o cambiare il PIN. */
function VerifyPin({ onVerified }: { onVerified(): void }) {
  const [message, setMessage] = useState<string | null>(null);
  const [waitUntil, setWaitUntil] = useState(0);
  return (
    <PinPad
      message={message}
      waitUntil={waitUntil}
      onComplete={async (pin) => {
        const check = await verifyPin(pin);
        if (check.ok) {
          onVerified();
          return true;
        }
        if (check.reason !== 'exhausted' && check.waitMs) setWaitUntil(Date.now() + check.waitMs);
        setMessage('PIN errato');
        return false;
      }}
    />
  );
}

/** Impostazioni di sicurezza del telefono: blocco dell'app con PIN, impronta o volto, cambio del PIN. */
export default function SecurityScreen() {
  const t = useTheme();
  const bottom = useBottomSpace();
  const [settings, setSettings] = useState<LockSettings | null>(null);
  const [canBiometrics, setCanBiometrics] = useState(false);
  const [flow, setFlow] = useState<Flow>(null);
  const [confirming, setConfirming] = useState(false);

  const reload = useCallback(async () => {
    setSettings(await getLockSettings());
    setCanBiometrics(await biometricsAvailable());
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);

  const close = () => {
    setFlow(null);
    setConfirming(false);
    void reload();
  };

  const active = !!settings && isLockActive(settings);

  const toggleLock = (on: boolean) => {
    if (on) return setFlow({ kind: 'enable' });
    Alert.alert('Disattivare il blocco?', 'Chiunque usi il telefono potrà aprire l’app e vedere i dati sanitari.', [
      { text: 'Annulla', style: 'cancel' },
      { text: 'Disattiva', style: 'destructive', onPress: () => setFlow({ kind: 'disable' }) },
    ]);
  };

  const toggleBiometrics = async (on: boolean) => {
    // Per attivarla si prova subito l'impronta: così si è sicuri che funzioni.
    if (on && !(await unlockWithBiometrics())) return;
    await setBiometricsEnabled(on);
    void reload();
  };

  const modalTitle =
    flow?.kind === 'disable'
      ? 'Inserisci il PIN'
      : flow?.kind === 'change' && !flow.verified
        ? 'PIN attuale'
        : confirming
          ? 'Conferma il PIN'
          : flow?.kind === 'change'
            ? 'Nuovo PIN'
            : 'Scegli il PIN';

  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={[styles.content, { paddingBottom: bottom }]}>
      <Stack.Screen options={{ title: 'Sicurezza' }} />
      <Card title="Blocco dell’app" subtitle="Protegge i dati sanitari salvati sul telefono.">
        <SwitchRow
          title="Chiedi il PIN per aprire l’app"
          subtitle="All’apertura e dopo un minuto in sottofondo"
          value={active}
          onChange={toggleLock}
          disabled={!settings}
        />
        <SwitchRow
          title="Sblocca con impronta o volto"
          subtitle={canBiometrics ? 'Il PIN resta come alternativa' : 'Nessuna impronta o volto registrati sul telefono'}
          value={active && !!settings?.biometrics}
          onChange={(v) => void toggleBiometrics(v)}
          disabled={!active || !canBiometrics}
        />
      </Card>
      {active ? <Row icon={KeyRound} title="Cambia PIN" subtitle="Serve il PIN attuale" onPress={() => setFlow({ kind: 'change', verified: false })} /> : null}
      <Text style={[styles.note, { color: t.muted }]}>
        Dopo 10 PIN sbagliati l’app esce dall’account e cancella i dati salvati sul telefono. Se dimentichi il PIN, esci dall’account dalla schermata di
        sblocco e rientra con email e password.
      </Text>

      <Modal visible={!!flow} animationType="slide" onRequestClose={close} statusBarTranslucent>
        <LockScreen icon={flow?.kind === 'disable' ? LockOpen : Lock} title={modalTitle} subtitle="6 cifre" onClose={close}>
          {flow?.kind === 'disable' ? (
            <VerifyPin
              onVerified={() => {
                void disableLock().then(close);
              }}
            />
          ) : flow?.kind === 'change' && !flow.verified ? (
            <VerifyPin onVerified={() => setFlow({ kind: 'change', verified: true })} />
          ) : flow ? (
            <PinSetup
              onStepChange={setConfirming}
              onDone={async (pin) => {
                await setPin(pin, { biometrics: flow.kind === 'change' ? !!settings?.biometrics : canBiometrics });
                close();
              }}
            />
          ) : null}
        </LockScreen>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.md },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
  note: { fontSize: 13, lineHeight: 19, paddingHorizontal: spacing.xs },
});
