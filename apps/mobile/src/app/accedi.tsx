import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api';
import { loadLastServer } from '@/lib/secure-storage';
import { useSession } from '@/lib/session';
import { Button, ErrorBox, Field, Paragraph, Screen, Title } from '@/ui/controls';

export default function SignInScreen() {
  const { signIn } = useSession();
  const [server, setServer] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  useEffect(() => {
    loadLastServer()
      .then((last) => last && setServer((s) => s || last))
      .catch(() => {});
  }, []);

  async function submit() {
    setError(null);
    setFields({});
    if (!server.trim()) return setError('Inserisci l’indirizzo del server.');
    setBusy(true);
    try {
      await signIn(server, email, password);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFields(err.fields ?? {});
      } else {
        setError('Accesso non riuscito.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Title>Cartelle Cliniche</Title>
      <Paragraph muted>Accedi con lo stesso account della webapp.</Paragraph>
      <ErrorBox message={error} />
      <Field
        label="Indirizzo del server"
        value={server}
        onChangeText={setServer}
        placeholder="https://cartelle.esempio.it"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        textContentType="URL"
      />
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        error={fields.email}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
      />
      <Field
        label="Password"
        value={password}
        onChangeText={setPassword}
        error={fields.password}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <Button title="Accedi" onPress={submit} busy={busy} />
    </Screen>
  );
}
