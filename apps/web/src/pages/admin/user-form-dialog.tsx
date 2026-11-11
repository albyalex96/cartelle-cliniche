import {
  ROLES,
  ROLE_LABELS,
  userCreateSchema,
  userUpdateSchema,
  type AccessEntry,
  type PatientDTO,
  type Role,
  type UserDTO,
} from '@alby/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Dices } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { api, errorMessage } from '@/lib/api';
import { initials } from '@/lib/format';
import { queryKeys } from '@/lib/query';
import { useZodForm } from '@/lib/use-zod-form';

type AccessLevel = 'none' | 'view' | 'edit';

const ROLE_HINTS: Record<Role, string> = {
  ADMIN: 'Vede e gestisce tutto, compresi utenti e registro accessi.',
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

function PatientAccessList({
  patients,
  access,
  onChange,
}: {
  patients: PatientDTO[];
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
}

export function UserFormDialog({ open, onOpenChange, user }: UserFormDialogProps) {
  const qc = useQueryClient();
  const isEdit = !!user;
  const initial: UserFormValues = {
    displayName: user?.displayName ?? '',
    email: user?.email ?? '',
    role: user?.role ?? 'PAZIENTE',
    password: '',
  };
  const form = useZodForm<UserFormValues, unknown>(
    (isEdit ? editSchema : createSchema) as z.ZodType<unknown, UserFormValues>,
    initial,
  );
  const [access, setAccess] = useState<Record<string, AccessLevel>>({});

  const patients = useQuery({
    queryKey: queryKeys.patients(''),
    queryFn: () => api.get<PatientDTO[]>('/patients'),
    enabled: open,
  });

  const { reset } = form;
  useEffect(() => {
    if (!open) return;
    reset(initial);
    setAccess(Object.fromEntries((user?.access ?? []).map((a) => [a.patientId, a.canEdit ? 'edit' : 'view'])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user]);

  const save = useMutation({
    mutationFn: (body: unknown) => (isEdit ? api.patch<UserDTO>(`/users/${user.id}`, body) : api.post<UserDTO>('/users', body)),
    onSuccess: (saved) => {
      void qc.invalidateQueries({ queryKey: queryKeys.users });
      toast.success(isEdit ? 'Utente aggiornato' : `Utente ${saved.displayName} creato`, {
        description: isEdit ? undefined : 'Al primo accesso dovrà scegliere una nuova password.',
      });
      onOpenChange(false);
    },
    onError: (err) => {
      if (!form.applyServerError(err)) toast.error(errorMessage(err));
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const data = form.validate();
    if (!data) return;
    const entries: AccessEntry[] = Object.entries(access)
      .filter(([, level]) => level !== 'none')
      .map(([patientId, level]) => ({ patientId, canEdit: level === 'edit' }));
    save.mutate({ ...(data as object), access: form.values.role === 'ADMIN' ? [] : entries });
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
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Genera password"
                    title="Genera password"
                    onClick={() => {
                      const pwd = generatePassword();
                      form.setValue('password', pwd);
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
            )}

            {form.values.role !== 'ADMIN' && (
              <FieldSet>
                <FieldLegend variant="label">Pazienti visibili</FieldLegend>
                <FieldDescription>Scegli quali schede può consultare e se può modificarle.</FieldDescription>
                {patients.isPending ? (
                  <Skeleton className="h-24 rounded-lg" />
                ) : (
                  <PatientAccessList
                    patients={patients.data ?? []}
                    access={access}
                    onChange={(id, level) => setAccess((a) => ({ ...a, [id]: level }))}
                  />
                )}
              </FieldSet>
            )}
          </FieldGroup>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Annulla
              </Button>
            </DialogClose>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Spinner />}
              {isEdit ? 'Salva modifiche' : 'Crea utente'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
