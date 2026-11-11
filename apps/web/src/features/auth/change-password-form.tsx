'use client';

import { changePasswordSchema } from '@alby/shared';
import { useRouter } from 'next/navigation';
import { useState, useTransition, type FormEvent } from 'react';
import { toast } from 'sonner';
import { FormField } from '@/components/form-field';
import { PasswordInput } from '@/components/password-input';
import { Button } from '@/components/ui/button';
import { FieldGroup } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { useZodForm } from '@/lib/use-zod-form';
import { changePasswordAction } from '@/server/actions/auth';

const EMPTY = { currentPassword: '', newPassword: '' };

export function ChangePasswordForm({
  submitLabel = 'Cambia password',
  redirectTo,
}: {
  submitLabel?: string;
  redirectTo?: string;
}) {
  const router = useRouter();
  const form = useZodForm(changePasswordSchema, EMPTY);
  const [confirm, setConfirm] = useState('');
  const [confirmError, setConfirmError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function submit(e: FormEvent) {
    e.preventDefault();
    const data = form.validate();
    const mismatch = form.values.newPassword !== confirm ? 'Le password non coincidono' : undefined;
    setConfirmError(mismatch);
    if (!data || mismatch) return;

    startTransition(async () => {
      const result = await changePasswordAction(data);
      if (result.ok) {
        toast.success('Password aggiornata', { description: 'Gli altri dispositivi sono stati disconnessi.' });
        form.reset(EMPTY);
        setConfirm('');
        if (redirectTo) router.replace(redirectTo);
        return;
      }
      if (result.code === 'WRONG_PASSWORD') form.setErrors({ currentPassword: result.message });
      else if (result.code === 'SAME_PASSWORD') form.setErrors({ newPassword: result.message });
      else if (!form.applyResult(result)) toast.error(result.message);
    });
  }

  return (
    <form onSubmit={submit} noValidate>
      <FieldGroup>
        <FormField label="Password attuale" htmlFor="currentPassword" error={form.errors.currentPassword}>
          <PasswordInput autoComplete="current-password" {...form.text('currentPassword')} />
        </FormField>
        <FormField label="Nuova password" htmlFor="newPassword" error={form.errors.newPassword} description="Almeno 10 caratteri.">
          <PasswordInput autoComplete="new-password" {...form.text('newPassword')} />
        </FormField>
        <FormField label="Conferma nuova password" htmlFor="confirmNew" error={confirmError}>
          <PasswordInput
            id="confirmNew"
            autoComplete="new-password"
            value={confirm}
            aria-invalid={confirmError ? true : undefined}
            onChange={(e) => {
              setConfirm(e.target.value);
              setConfirmError(undefined);
            }}
          />
        </FormField>
        <Button type="submit" disabled={pending} className="sm:w-fit">
          {pending && <Spinner />}
          {submitLabel}
        </Button>
      </FieldGroup>
    </form>
  );
}
