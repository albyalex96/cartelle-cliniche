import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api';
import { loadLastServer } from '@/lib/secure-storage';
import { useSession } from '@/lib/session';
import { Button, ErrorBox, Field, Paragraph, Screen, Title } from '@/ui/controls';
import { LogIn } from 'lucide-react-native';

export default function SignInScreen() {
  const { signIn } = useSession();
  const [server, setServer] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [needsCode, setNeedsCode] = useState(false);
  const [code, setCode] = useState('');
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
      await signIn(server, email, password, needsCode ? code.trim() : undefined);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'TWO_FACTOR_REQUIRED' && !needsCode) {
        // Alla prima richiesta il campo appare e basta: non è un errore.
        setNeedsCode(true);
      } else if (err instanceof ApiError) {
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
      {needsCode && (
        <Field
          label="Codice di verifica o di recupero"
          value={code}
          onChangeText={setCode}
          error={fields.code}
          autoFocus
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          returnKeyType="go"
          onSubmitEditing={submit}
        />
      )}
      <Button title="Accedi" icon={LogIn} onPress={submit} busy={busy} />
    </Screen>
  );
}
