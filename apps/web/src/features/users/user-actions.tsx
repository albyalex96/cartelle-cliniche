'use client';

import type { UserDTO } from '@alby/shared';
import { KeyRound, MoreHorizontal, Pencil, Plus, Power, PowerOff } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Spinner } from '@/components/ui/spinner';
import { updateUserAction } from '@/server/actions/users';
import { ResetPasswordDialog } from './reset-password-dialog';
import { UserFormDialog, type PatientOption } from './user-form-dialog';

export function NewUserButton({ patients }: { patients: PatientOption[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus />
        Nuovo utente
      </Button>
      <UserFormDialog open={open} onOpenChange={setOpen} patients={patients} />
    </>
  );
}

/** Menu azioni di una riga della tabella utenti (la tabella resta un Server Component). */
export function UserRowActions({ user, isSelf, patients }: { user: UserDTO; isSelf: boolean; patients: PatientOption[] }) {
  const [editing, setEditing] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [toggling, startToggle] = useTransition();

  function toggleActive() {
    startToggle(async () => {
      const result = await updateUserAction(user.id, { active: !user.active });
      if (!result.ok) toast.error(result.message);
      else toast.success(result.data.active ? `${user.displayName} riattivato` : `${user.displayName} disattivato`);
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Azioni per ${user.displayName}`} disabled={toggling}>
            {toggling ? <Spinner /> : <MoreHorizontal />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditing(true)}>
            <Pencil />
            Modifica
          </DropdownMenuItem>
          {!isSelf && (
            <>
              <DropdownMenuItem onSelect={() => setResetting(true)}>
                <KeyRound />
                Reimposta password
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant={user.active ? 'destructive' : 'default'} onSelect={toggleActive}>
                {user.active ? <PowerOff /> : <Power />}
                {user.active ? 'Disattiva' : 'Riattiva'}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <UserFormDialog open={editing} onOpenChange={setEditing} user={user} patients={patients} />
      {!isSelf && <ResetPasswordDialog user={user} open={resetting} onOpenChange={setResetting} />}
    </>
  );
}
