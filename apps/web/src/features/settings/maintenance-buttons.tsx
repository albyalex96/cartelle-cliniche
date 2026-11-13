'use client';

import { Eraser, LogOut } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { revokeAllSessionsAction, runMaintenanceAction } from '@/server/actions/settings';

const count = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n.toLocaleString('it-IT')} ${many}`);

/** Chiude le sessioni di tutti, tranne quella di chi preme il pulsante (chiede conferma). */
export function RevokeSessionsButton() {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline">
          <LogOut />
          Disconnetti tutti
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Disconnettere tutti gli utenti?</AlertDialogTitle>
          <AlertDialogDescription>
            Tutti gli utenti, su tutti i dispositivi, dovranno rientrare con email e password. Tu resti collegato solo su questo dispositivo.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Annulla</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={(e) => {
              e.preventDefault();
              startTransition(async () => {
                const result = await revokeAllSessionsAction();
                if (!result.ok) toast.error(result.message);
                else {
                  toast.success(
                    result.data.sessions === 0 ? 'Non c’erano altre sessioni aperte' : `${count(result.data.sessions, 'sessione chiusa', 'sessioni chiuse')}`,
                  );
                  setOpen(false);
                }
              });
            }}
          >
            {pending && <Spinner />}
            Disconnetti tutti
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Avvia subito la pulizia che il server fa da solo una volta al giorno. */
export function RunMaintenanceButton() {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await runMaintenanceAction();
          if (!result.ok) return void toast.error(result.message);
          const { expiredSessions, auditEntries } = result.data;
          if (expiredSessions + auditEntries === 0) toast.success('Niente da eliminare');
          else {
            toast.success('Pulizia completata', {
              description: [
                expiredSessions > 0 && count(expiredSessions, 'sessione scaduta eliminata', 'sessioni scadute eliminate'),
                auditEntries > 0 && count(auditEntries, 'voce dell’audit log eliminata', 'voci dell’audit log eliminate'),
              ]
                .filter(Boolean)
                .join(' · '),
            });
          }
        })
      }
    >
      {pending ? <Spinner /> : <Eraser />}
      Esegui ora la pulizia
    </Button>
  );
}
