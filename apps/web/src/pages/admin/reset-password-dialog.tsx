import { resetPasswordSchema, type UserDTO } from '@alby/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dices } from 'lucide-react';
import { useEffect, type FormEvent } from 'react';
import { toast } from 'sonner';
import { FormField } from '@/components/form-field';
import { PasswordInput, generatePassword } from '@/components/password-input';
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
import { api, errorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/query';
import { useZodForm } from '@/lib/use-zod-form';

export function ResetPasswordDialog({ user, onClose }: { user: UserDTO | null; onClose: () => void }) {
  const qc = useQueryClient();
  const form = useZodForm(resetPasswordSchema, { newPassword: '' });
  const { reset } = form;

  useEffect(() => {
    if (user) reset({ newPassword: '' });
  }, [user, reset]);

  const save = useMutation({
    mutationFn: (body: unknown) => api.post<void>(`/users/${user!.id}/reset-password`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.users });
      toast.success('Password reimpostata', {
        description: `${user!.displayName} è stato disconnesso e al prossimo accesso dovrà sceglierne una nuova.`,
      });
      onClose();
    },
    onError: (err) => {
      if (!form.applyServerError(err)) toast.error(errorMessage(err));
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const data = form.validate();
    if (data) save.mutate(data);
  }

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} noValidate className="grid gap-6">
          <DialogHeader>
            <DialogTitle>Reimposta password</DialogTitle>
            <DialogDescription>
              Imposta una password temporanea per {user?.displayName}. Tutte le sue sessioni verranno chiuse.
            </DialogDescription>
          </DialogHeader>
          <FormField label="Password temporanea" htmlFor="newPassword" error={form.errors.newPassword}>
            <div className="flex gap-2">
              <PasswordInput autoFocus autoComplete="new-password" {...form.text('newPassword')} />
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Genera password"
                title="Genera password"
                onClick={() => {
                  const pwd = generatePassword();
                  form.setValue('newPassword', pwd);
                  void navigator.clipboard?.writeText(pwd).then(
                    () => toast.info('Password generata e copiata negli appunti'),
                    () => {},
                  );
                }}
              >
                <Dices />
              </Button>
            </div>
          </FormField>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Annulla
              </Button>
            </DialogClose>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Spinner />}
              Reimposta
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
