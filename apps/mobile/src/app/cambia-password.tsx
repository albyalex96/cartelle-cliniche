import { useState } from 'react';
import { ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Button, ErrorBox, Field, Paragraph, Screen, Title } from '@/ui/controls';
import { KeyRound, LogOut } from 'lucide-react-native';

/** Cambio password obbligatorio al primo accesso (account creato dall'amministratore). */
export default function ChangePasswordScreen() {
  const { changePassword, signOut } = useSession();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function submit() {
    setError(null);
    setFields({});
    if (next !== confirm) return setFields({ confirm: 'Le due password non coincidono' });
    setBusy(true);
    try {
      await changePassword(current, next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Cambio password non riuscito.');
      if (err instanceof ApiError) setFields(err.fields ?? {});
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Title>Nuova password</Title>
      <Paragraph muted>Al primo accesso devi scegliere una password tua.</Paragraph>
      <ErrorBox message={error} />
      <Field label="Password attuale" value={current} onChangeText={setCurrent} error={fields.currentPassword} secureTextEntry autoComplete="current-password" />
      <Field label="Nuova password" value={next} onChangeText={setNext} error={fields.newPassword} secureTextEntry autoComplete="new-password" />
      <Field label="Ripeti la nuova password" value={confirm} onChangeText={setConfirm} error={fields.confirm} secureTextEntry autoComplete="new-password" onSubmitEditing={submit} />
      <Button title="Salva" icon={KeyRound} onPress={submit} busy={busy} />
      <Button title="Esci" icon={LogOut} variant="secondary" onPress={signOut} disabled={busy} />
    </Screen>
  );
}
