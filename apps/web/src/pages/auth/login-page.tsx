import { loginSchema, type LoginResponseDTO } from '@alby/shared';
import { useMutation } from '@tanstack/react-query';
import { CircleAlert } from 'lucide-react';
import type { FormEvent } from 'react';
import { FormField } from '@/components/form-field';
import { PasswordInput } from '@/components/password-input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FieldGroup } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useSignedIn } from '@/hooks/use-session';
import { api, errorMessage } from '@/lib/api';
import { useZodForm } from '@/lib/use-zod-form';
import { AuthLayout } from './auth-layout';

export default function LoginPage() {
  const signedIn = useSignedIn();
  const form = useZodForm(loginSchema, { email: '', password: '' });

  const login = useMutation({
    mutationFn: (data: unknown) => api.post<LoginResponseDTO>('/auth/login', data),
    onSuccess: ({ user }) => signedIn(user),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const data = form.validate();
    if (data) login.mutate(data);
  }

  return (
    <AuthLayout title="Accedi" description="Inserisci le tue credenziali per continuare.">
      <form onSubmit={submit} noValidate>
        <FieldGroup>
          {login.isError && (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertDescription>{errorMessage(login.error)}</AlertDescription>
            </Alert>
          )}
          <FormField label="Email" htmlFor="email" error={form.errors.email}>
            <Input type="email" autoComplete="username" autoFocus {...form.text('email')} />
          </FormField>
          <FormField label="Password" htmlFor="password" error={form.errors.password}>
            <PasswordInput autoComplete="current-password" {...form.text('password')} />
          </FormField>
          <Button type="submit" size="lg" disabled={login.isPending}>
            {login.isPending && <Spinner />}
            Accedi
          </Button>
        </FieldGroup>
      </form>
    </AuthLayout>
  );
}
