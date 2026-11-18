'use client';

import { loginSchema } from '@alby/shared';
import { startAuthentication } from '@simplewebauthn/browser';
import { CircleAlert, Fingerprint } from 'lucide-react';
import { useState, useTransition, type FormEvent } from 'react';
import { FormField } from '@/components/form-field';
import { PasswordInput } from '@/components/password-input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FieldGroup } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useZodForm } from '@/lib/use-zod-form';
import { beginPasskeyLoginAction, loginAction, passkeyLoginAction } from '@/server/actions/auth';

export function LoginForm({ passkeys }: { passkeys: boolean }) {
  const form = useZodForm(loginSchema, { email: '', password: '' });
  const [needsCode, setNeedsCode] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function submit(e: FormEvent) {
    e.preventDefault();
    const data = form.validate();
    if (!data) return;
    setError(undefined);
    startTransition(async () => {
      const result = await loginAction(needsCode ? { ...data, code } : data);
      if (result.ok) return;
      if (result.code === 'TWO_FACTOR_REQUIRED') {
        // Alla prima richiesta il campo appare e basta: non è un errore.
        if (needsCode) setError(result.message);
        setNeedsCode(true);
        return;
      }
      setError(result.message);
      setCode('');
    });
  }

  function signInWithPasskey() {
    setError(undefined);
    startTransition(async () => {
      const begun = await beginPasskeyLoginAction();
      if (!begun.ok) return setError(begun.message);
      let response;
      try {
        response = await startAuthentication({ optionsJSON: begun.data.options });
      } catch {
        return setError('Accesso con passkey annullato o non disponibile');
      }
      const result = await passkeyLoginAction({ challenge: begun.data.challenge, response });
      if (!result.ok) setError(result.message);
    });
  }

  return (
    <form onSubmit={submit} noValidate>
      <FieldGroup>
        {error && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <FormField label="Email" htmlFor="email" error={form.errors.email}>
          <Input type="email" autoComplete="username" autoFocus {...form.text('email')} />
        </FormField>
        <FormField label="Password" htmlFor="password" error={form.errors.password}>
          <PasswordInput autoComplete="current-password" {...form.text('password')} />
        </FormField>
        {needsCode && (
          <FormField label="Codice di verifica" htmlFor="code" description="Le 6 cifre dell’app di autenticazione, oppure un codice di recupero.">
            <Input id="code" autoFocus autoComplete="one-time-code" maxLength={32} value={code} onChange={(e) => setCode(e.target.value)} />
          </FormField>
        )}
        <Button type="submit" size="lg" disabled={pending}>
          {pending && <Spinner />}
          Accedi
        </Button>
        {passkeys && (
          <Button type="button" size="lg" variant="outline" disabled={pending} onClick={signInWithPasskey}>
            <Fingerprint />
            Accedi con una passkey
          </Button>
        )}
      </FieldGroup>
    </form>
  );
}
