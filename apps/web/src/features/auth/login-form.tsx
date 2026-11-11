'use client';

import { loginSchema } from '@alby/shared';
import { CircleAlert } from 'lucide-react';
import { useState, useTransition, type FormEvent } from 'react';
import { FormField } from '@/components/form-field';
import { PasswordInput } from '@/components/password-input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FieldGroup } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useZodForm } from '@/lib/use-zod-form';
import { loginAction } from '@/server/actions/auth';

export function LoginForm() {
  const form = useZodForm(loginSchema, { email: '', password: '' });
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function submit(e: FormEvent) {
    e.preventDefault();
    const data = form.validate();
    if (!data) return;
    setError(undefined);
    startTransition(async () => {
      const result = await loginAction(data);
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
        <Button type="submit" size="lg" disabled={pending}>
          {pending && <Spinner />}
          Accedi
        </Button>
      </FieldGroup>
    </form>
  );
}
