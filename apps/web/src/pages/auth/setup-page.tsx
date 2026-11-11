import { setupSchema, type LoginResponseDTO } from '@alby/shared';
import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { FormField } from '@/components/form-field';
import { PasswordInput } from '@/components/password-input';
import { Button } from '@/components/ui/button';
import { FieldGroup } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useSignedIn } from '@/hooks/use-session';
import { api, errorMessage } from '@/lib/api';
import { useZodForm } from '@/lib/use-zod-form';
import { AuthLayout } from './auth-layout';

export default function SetupPage() {
  const signedIn = useSignedIn();
  const form = useZodForm(setupSchema, { displayName: '', email: '', password: '' });
  const [confirm, setConfirm] = useState('');
  const [confirmError, setConfirmError] = useState<string>();

  const setup = useMutation({
    mutationFn: (data: unknown) => api.post<LoginResponseDTO>('/setup', data),
    onSuccess: ({ user }) => {
      toast.success(`Benvenuto, ${user.displayName}!`);
      signedIn(user);
    },
    onError: (err) => {
      if (!form.applyServerError(err)) toast.error(errorMessage(err));
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const data = form.validate();
    const mismatch = form.values.password !== confirm ? 'Le password non coincidono' : undefined;
    setConfirmError(mismatch);
    if (data && !mismatch) setup.mutate(data);
  }

  return (
    <AuthLayout
      title="Configurazione iniziale"
      description="Crea l’account amministratore: potrai poi aggiungere i pazienti e gli altri utenti."
      footer="Questo passaggio è disponibile solo al primo avvio."
    >
      <form onSubmit={submit} noValidate>
        <FieldGroup>
          <FormField label="Il tuo nome" htmlFor="displayName" error={form.errors.displayName}>
            <Input autoFocus autoComplete="name" {...form.text('displayName')} />
          </FormField>
          <FormField label="Email" htmlFor="email" error={form.errors.email}>
            <Input type="email" autoComplete="email" {...form.text('email')} />
          </FormField>
          <FormField
            label="Password"
            htmlFor="password"
            error={form.errors.password}
            description="Almeno 10 caratteri. Meglio una frase lunga che una parola complicata."
          >
            <PasswordInput autoComplete="new-password" {...form.text('password')} />
          </FormField>
          <FormField label="Conferma password" htmlFor="confirm" error={confirmError}>
            <PasswordInput
              id="confirm"
              autoComplete="new-password"
              value={confirm}
              aria-invalid={confirmError ? true : undefined}
              onChange={(e) => {
                setConfirm(e.target.value);
                setConfirmError(undefined);
              }}
            />
          </FormField>
          <Button type="submit" size="lg" disabled={setup.isPending}>
            {setup.isPending && <Spinner />}
            Crea account e inizia
          </Button>
        </FieldGroup>
      </form>
    </AuthLayout>
  );
}
