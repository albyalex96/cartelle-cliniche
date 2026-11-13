'use client';

import { ROLES, ROLE_LABELS, userCreateSchema, userUpdateSchema, type AccessEntry, type Role, type UserDTO } from '@alby/shared';
import { Dices } from 'lucide-react';
import { useEffect, useState, useTransition, type FormEvent } from 'react';
import { toast } from 'sonner';
import type { z } from 'zod';
import { FormField } from '@/components/form-field';
import { PasswordInput, generatePassword } from '@/components/password-input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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
import { FieldDescription, FieldGroup, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { initials } from '@/lib/format';
import { useZodForm } from '@/lib/use-zod-form';
import { createUserAction, updateUserAction } from '@/server/actions/users';

/** Dati minimi dei pazienti per scegliere gli accessi (passati dal server). */
export interface PatientOption {
  id: string;
  firstName: string;
  lastName: string;
}

type AccessLevel = 'none' | 'view' | 'edit';

const ROLE_HINTS: Record<Role, string> = {
  ADMIN: 'Vede e gestisce tutto, compresi utenti e audit log.',
  MEDICO: 'Vede solo i pazienti a cui dai accesso. (Funzioni dedicate in arrivo.)',
  PAZIENTE: 'Vede solo le schede a cui dai accesso, ad esempio la propria.',
};

// La password si sceglie solo alla creazione; in modifica non è nel form.
const createSchema = userCreateSchema.omit({ access: true });
const editSchema = userUpdateSchema.required({ displayName: true, email: true, role: true }).omit({ access: true, active: true });

interface UserFormValues extends Record<string, unknown> {
  displayName: string;
  email: string;
  role: Role;
  password: string;
}

export function PasswordGenerateButton({ onGenerate }: { onGenerate: (pwd: string) => void }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label="Genera password"
      title="Genera password"
      onClick={() => {
        const pwd = generatePassword();
        onGenerate(pwd);
        void navigator.clipboard?.writeText(pwd).then(
          () => toast.info('Password generata e copiata negli appunti'),
          () => {},
        );
      }}
    >
      <Dices />
    </Button>
  );
}

function PatientAccessList({
  patients,
  access,
  onChange,
}: {
  patients: PatientOption[];
  access: Record<string, AccessLevel>;
  onChange: (patientId: string, level: AccessLevel) => void;
}) {
  if (patients.length === 0) {
    return <p className="text-sm text-muted-foreground">Non ci sono ancora pazienti in archivio.</p>;
  }
  return (
    <div className="divide-y rounded-lg border">
      {patients.map((p) => (
        <div key={p.id} className="flex items-center gap-3 px-3 py-2">
          <Avatar className="size-7">
            <AvatarFallback className="text-xs">{initials(p.firstName, p.lastName)}</AvatarFallback>
          </Avatar>
          <span className="min-w-0 flex-1 truncate text-sm">
            {p.lastName} {p.firstName}
          </span>
          <Select value={access[p.id] ?? 'none'} onValueChange={(v) => onChange(p.id, v as AccessLevel)}>
            <SelectTrigger size="sm" className="w-40" aria-label={`Accesso a ${p.firstName} ${p.lastName}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="none">Nessun accesso</SelectItem>
              <SelectItem value="view">Sola lettura</SelectItem>
              <SelectItem value="edit">Lettura e modifica</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ))}
    </div>
  );
}

interface UserFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user?: UserDTO;
  patients: PatientOption[];
}

export function UserFormDialog({ open, onOpenChange, user, patients }: UserFormDialogProps) {
  const isEdit = !!user;
  const [pending, startTransition] = useTransition();
  const [access, setAccess] = useState<Record<string, AccessLevel>>({});
  const form = useZodForm<UserFormValues, unknown>(
    (isEdit ? editSchema : createSchema) as z.ZodType<unknown, UserFormValues>,
    { displayName: '', email: '', role: 'PAZIENTE', password: '' },
  );
  const { reset } = form;

  useEffect(() => {
    if (!open) return;
    reset({ displayName: user?.displayName ?? '', email: user?.email ?? '', role: user?.role ?? 'PAZIENTE', password: '' });
    setAccess(Object.fromEntries((user?.access ?? []).map((a) => [a.patientId, a.canEdit ? 'edit' : 'view'])));
  }, [open, user, reset]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const data = form.validate();
    if (!data) return;
    const entries: AccessEntry[] = Object.entries(access)
      .filter(([, level]) => level !== 'none')
      .map(([patientId, level]) => ({ patientId, canEdit: level === 'edit' }));
    const body = { ...(data as object), access: form.values.role === 'ADMIN' ? [] : entries };

    startTransition(async () => {
      const result = isEdit ? await updateUserAction(user.id, body) : await createUserAction(body);
      if (result.ok) {
        toast.success(isEdit ? 'Utente aggiornato' : `Utente ${result.data.displayName} creato`, {
          description: isEdit ? undefined : 'Al primo accesso dovrà scegliere una nuova password.',
        });
        onOpenChange(false);
      } else if (!form.applyResult(result)) {
        toast.error(result.message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <form onSubmit={submit} noValidate className="grid gap-6">
          <DialogHeader>
            <DialogTitle>{isEdit ? `Modifica ${user.displayName}` : 'Nuovo utente'}</DialogTitle>
            <DialogDescription>
              {isEdit
                ? 'Modifica i dati dell’account e i pazienti che può vedere.'
                : 'Crea un account per un familiare. Gli comunicherai tu la password iniziale.'}
            </DialogDescription>
          </DialogHeader>

          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Nome" htmlFor="displayName" error={form.errors.displayName}>
                <Input autoFocus autoComplete="off" {...form.text('displayName')} />
              </FormField>
              <FormField label="Email (per l’accesso)" htmlFor="email" error={form.errors.email}>
                <Input type="email" autoComplete="off" {...form.text('email')} />
              </FormField>
            </div>

            <FormField label="Ruolo" htmlFor="role" error={form.errors.role} description={ROLE_HINTS[form.values.role]}>
              <Select value={form.values.role} onValueChange={(v) => form.setValue('role', v as Role)}>
                <SelectTrigger id="role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            {!isEdit && (
              <FormField
                label="Password iniziale"
                htmlFor="password"
                error={form.errors.password}
                description="Almeno 10 caratteri. Verrà chiesto di cambiarla al primo accesso."
              >
                <div className="flex gap-2">
                  <PasswordInput autoComplete="new-password" {...form.text('password')} />
                  <PasswordGenerateButton onGenerate={(pwd) => form.setValue('password', pwd)} />
                </div>
              </FormField>
            )}

            {form.values.role !== 'ADMIN' && (
              <FieldSet>
                <FieldLegend variant="label">Pazienti visibili</FieldLegend>
                <FieldDescription>Scegli quali schede può consultare e se può modificarle.</FieldDescription>
                <PatientAccessList
                  patients={patients}
                  access={access}
                  onChange={(id, level) => setAccess((a) => ({ ...a, [id]: level }))}
                />
              </FieldSet>
            )}
          </FieldGroup>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Annulla
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending && <Spinner />}
              {isEdit ? 'Salva modifiche' : 'Crea utente'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
