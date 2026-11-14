'use client';

import type { LockdownDTO } from '@alby/shared';
import { ShieldAlert, ShieldCheck } from 'lucide-react';
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
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { Spinner } from '@/components/ui/spinner';
import { formatDateTime } from '@/lib/format';
import { setLockdownAction } from '@/server/actions/settings';

/**
 * Bottone "anti-panico" degli amministratori, sopra il profilo: sospende (o ripristina) l'accesso
 * di tutti gli utenti non amministratori, senza chiudere le loro sessioni. Chiede sempre conferma.
 */
export function LockdownButton({ lockdown }: { lockdown: LockdownDTO | null }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const active = lockdown !== null;
  const label = active ? 'Accessi bloccati' : 'Blocca accessi';

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogTrigger asChild>
            <SidebarMenuButton
              tooltip={label}
              className={
                active
                  ? 'bg-destructive/10 font-medium text-destructive hover:bg-destructive/20 hover:text-destructive dark:bg-destructive/20'
                  : 'text-muted-foreground'
              }
            >
              <ShieldAlert />
              <span>{label}</span>
            </SidebarMenuButton>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{active ? 'Ripristinare gli accessi?' : 'Bloccare gli accessi?'}</AlertDialogTitle>
              <AlertDialogDescription asChild>
                {active ? (
                  <div className="grid gap-2">
                    <p>
                      Blocco attivo dal {formatDateTime(lockdown.since)}
                      {lockdown.byName ? `, attivato da ${lockdown.byName}` : ''}. Sbloccando, gli utenti riprenderanno a lavorare
                      senza dover rientrare.
                    </p>
                    <p>
                      Se sospetti che un account sia stato usato da qualcun altro, prima di sbloccare reimpostane la password dalla
                      pagina Utenti: le sue sessioni verranno chiuse.
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-2">
                    <p>
                      Tutti gli utenti che non sono amministratori, dalla webapp e dall’app, verranno sospesi subito e non potranno
                      accedere finché non ripristini gli accessi.
                    </p>
                    <p>Il loro login resta valido: allo sblocco continueranno da dove erano.</p>
                  </div>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>Annulla</AlertDialogCancel>
              <AlertDialogAction
                variant={active ? 'default' : 'destructive'}
                disabled={pending}
                onClick={(e) => {
                  e.preventDefault();
                  startTransition(async () => {
                    const result = await setLockdownAction(!active);
                    if (!result.ok) return void toast.error(result.message);
                    toast.success(active ? 'Accessi ripristinati' : 'Accessi bloccati per chi non è amministratore');
                    setOpen(false);
                  });
                }}
              >
                {pending ? <Spinner /> : active ? <ShieldCheck /> : <ShieldAlert />}
                {active ? 'Ripristina gli accessi' : 'Blocca gli accessi'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
