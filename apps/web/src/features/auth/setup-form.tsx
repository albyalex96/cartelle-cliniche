'use client';

import { setupSchema } from '@alby/shared';
import { useState, useTransition, type FormEvent } from 'react';
import { toast } from 'sonner';
import { FormField } from '@/components/form-field';
import { PasswordInput } from '@/components/password-input';
import { Button } from '@/components/ui/button';
import { FieldGroup } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useZodForm } from '@/lib/use-zod-form';
import { setupAction } from '@/server/actions/auth';

export function SetupForm() {
  const form = useZodForm(setupSchema, { displayName: '', email: '', password: '' });
  const [confirm, setConfirm] = useState('');
  const [confirmError, setConfirmError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function submit(e: FormEvent) {
    e.preventDefault();
    const data = form.validate();
    const mismatch = form.values.password !== confirm ? 'Le password non coincidono' : undefined;
    setConfirmError(mismatch);
    if (!data || mismatch) return;
    startTransition(async () => {
      // In caso di successo il server reindirizza all'archivio.
      const result = await setupAction(data);
      if (!result.ok && !form.applyResult(result)) toast.error(result.message);
    });
  }

  return (
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
        <Button type="submit" size="lg" disabled={pending}>
          {pending && <Spinner />}
          Crea account e inizia
        </Button>
      </FieldGroup>
    </form>
  );
}
