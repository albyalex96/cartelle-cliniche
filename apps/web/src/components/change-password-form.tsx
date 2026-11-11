import { changePasswordSchema, type MeDTO } from '@alby/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { FormField } from '@/components/form-field';
import { PasswordInput } from '@/components/password-input';
import { Button } from '@/components/ui/button';
import { FieldGroup } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { api, ApiError, errorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/query';
import { useZodForm } from '@/lib/use-zod-form';

const EMPTY = { currentPassword: '', newPassword: '' };

export function ChangePasswordForm({ submitLabel = 'Cambia password' }: { submitLabel?: string }) {
  const qc = useQueryClient();
  const form = useZodForm(changePasswordSchema, EMPTY);
  const [confirm, setConfirm] = useState('');
  const [confirmError, setConfirmError] = useState<string>();

  const change = useMutation({
    mutationFn: (data: unknown) => api.post<MeDTO>('/auth/change-password', data),
    onSuccess: (me) => {
      toast.success('Password aggiornata', { description: 'Gli altri dispositivi sono stati disconnessi.' });
      form.reset(EMPTY);
      setConfirm('');
      qc.setQueryData(queryKeys.me, me);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === 'WRONG_PASSWORD') {
        form.setErrors({ currentPassword: err.message });
      } else if (err instanceof ApiError && err.code === 'SAME_PASSWORD') {
        form.setErrors({ newPassword: err.message });
      } else if (!form.applyServerError(err)) {
        toast.error(errorMessage(err));
      }
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const data = form.validate();
    const mismatch = form.values.newPassword !== confirm ? 'Le password non coincidono' : undefined;
    setConfirmError(mismatch);
    if (data && !mismatch) change.mutate(data);
  }

  return (
    <form onSubmit={submit} noValidate>
      <FieldGroup>
        <FormField label="Password attuale" htmlFor="currentPassword" error={form.errors.currentPassword}>
          <PasswordInput autoComplete="current-password" {...form.text('currentPassword')} />
        </FormField>
        <FormField
          label="Nuova password"
          htmlFor="newPassword"
          error={form.errors.newPassword}
          description="Almeno 10 caratteri."
        >
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
        <Button type="submit" disabled={change.isPending} className="sm:w-fit">
          {change.isPending && <Spinner />}
          {submitLabel}
        </Button>
      </FieldGroup>
    </form>
  );
}
