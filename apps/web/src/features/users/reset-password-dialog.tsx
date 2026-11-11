'use client';

import { resetPasswordSchema, type UserDTO } from '@alby/shared';
import { useEffect, useTransition, type FormEvent } from 'react';
import { toast } from 'sonner';
import { FormField } from '@/components/form-field';
import { PasswordInput } from '@/components/password-input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { useZodForm } from '@/lib/use-zod-form';
import { resetPasswordAction } from '@/server/actions/users';
import { PasswordGenerateButton } from './user-form-dialog';

export function ResetPasswordDialog({ user, open, onOpenChange }: { user: UserDTO; open: boolean; onOpenChange: (o: boolean) => void }) {
  const form = useZodForm(resetPasswordSchema, { newPassword: '' });
  const [pending, startTransition] = useTransition();
  const { reset } = form;

  useEffect(() => {
    if (open) reset({ newPassword: '' });
  }, [open, reset]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const data = form.validate();
    if (!data) return;
    startTransition(async () => {
      const result = await resetPasswordAction(user.id, data);
      if (result.ok) {
        toast.success('Password reimpostata', {
          description: `${user.displayName} è stato disconnesso e al prossimo accesso dovrà sceglierne una nuova.`,
        });
        onOpenChange(false);
      } else if (!form.applyResult(result)) {
        toast.error(result.message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} noValidate className="grid gap-6">
          <DialogHeader>
            <DialogTitle>Reimposta password</DialogTitle>
            <DialogDescription>
              Imposta una password temporanea per {user.displayName}. Tutte le sue sessioni verranno chiuse.
            </DialogDescription>
          </DialogHeader>
          <FormField label="Password temporanea" htmlFor="newPassword" error={form.errors.newPassword}>
            <div className="flex gap-2">
              <PasswordInput autoFocus autoComplete="new-password" {...form.text('newPassword')} />
              <PasswordGenerateButton onGenerate={(pwd) => form.setValue('newPassword', pwd)} />
            </div>
          </FormField>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Annulla
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending && <Spinner />}
              Reimposta
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
