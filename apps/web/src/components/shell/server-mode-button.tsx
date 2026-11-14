'use client';

import { MAINTENANCE_NOTE_MAX, type LockdownDTO, type MaintenanceModeDTO } from '@alby/shared';
import { ShieldAlert, ShieldCheck, Wrench } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { FormField } from '@/components/form-field';
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
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { formatDateTime } from '@/lib/format';
import type { ActionResult } from '@/server/action-result';
import { setLockdownAction, setMaintenanceModeAction } from '@/server/actions/settings';

type Props = { mode: 'lockdown'; state: LockdownDTO | null } | { mode: 'maintenance'; state: MaintenanceModeDTO | null };

const ACTIVE_STYLE = {
  lockdown: 'bg-destructive/10 font-medium text-destructive hover:bg-destructive/20 hover:text-destructive dark:bg-destructive/20',
  maintenance:
    'bg-amber-100 font-medium text-amber-900 hover:bg-amber-200 hover:text-amber-900 dark:bg-amber-950 dark:text-amber-200 dark:hover:bg-amber-900 dark:hover:text-amber-100',
};

const since = (state: LockdownDTO) =>
  `Attiva dal ${formatDateTime(state.since)}${state.byName ? `, attivata da ${state.byName}` : ''}.`;

/**
 * Bottoni degli amministratori sopra il profilo, sempre con conferma:
 * - `maintenance`: chi non è amministratore può solo consultare, con un avviso facoltativo per tutti;
 * - `lockdown` ("anti-panico"): chi non è amministratore è sospeso, senza perdere il login.
 */
export function ServerModeButton(props: Props) {
  const { mode, state } = props;
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const savedMessage = props.mode === 'maintenance' ? (props.state?.message ?? '') : '';
  const [message, setMessage] = useState(savedMessage);
  const active = state !== null;
  const isMaintenance = mode === 'maintenance';

  const label = isMaintenance
    ? active
      ? 'Manutenzione attiva'
      : 'Modalità manutenzione'
    : active
      ? 'Accessi bloccati'
      : 'Blocca accessi';
  const Icon = isMaintenance ? Wrench : ShieldAlert;

  const run = (call: () => Promise<ActionResult>, success: string) =>
    startTransition(async () => {
      const result = await call();
      if (!result.ok) return void toast.error(result.fields?.message ?? result.message);
      toast.success(success);
      setOpen(false);
    });

  const toggle = () =>
    isMaintenance
      ? run(
          () => setMaintenanceModeAction({ active: !active, message }),
          active ? 'Manutenzione terminata' : 'Manutenzione attivata: chi non è amministratore può solo consultare',
        )
      : run(() => setLockdownAction(!active), active ? 'Accessi ripristinati' : 'Accessi bloccati per chi non è amministratore');

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <AlertDialog
          open={open}
          onOpenChange={(next) => {
            if (next) setMessage(savedMessage);
            setOpen(next);
          }}
        >
          <AlertDialogTrigger asChild>
            <SidebarMenuButton tooltip={label} className={active ? ACTIVE_STYLE[mode] : 'text-muted-foreground'}>
              <Icon />
              <span>{label}</span>
            </SidebarMenuButton>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {isMaintenance
                  ? active
                    ? 'Manutenzione in corso'
                    : 'Attivare la modalità manutenzione?'
                  : active
                    ? 'Ripristinare gli accessi?'
                    : 'Bloccare gli accessi?'}
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="grid gap-2">
                  {isMaintenance ? (
                    active ? (
                      <p>
                        {since(state!)} Terminandola, chi ha il permesso di modifica potrà di nuovo modificare i dati.
                      </p>
                    ) : (
                      <p>
                        Chi non è amministratore potrà consultare i dati ma non modificarli, dalla webapp e dall’app, finché non
                        termini la manutenzione. Gli amministratori continuano a lavorare normalmente.
                      </p>
                    )
                  ) : active ? (
                    <>
                      <p>{since(state!)} Sbloccando, gli utenti riprenderanno a lavorare senza dover rientrare.</p>
                      <p>
                        Se sospetti che un account sia stato usato da qualcun altro, prima di sbloccare reimpostane la password
                        dalla pagina Utenti: le sue sessioni verranno chiuse.
                      </p>
                    </>
                  ) : (
                    <>
                      <p>
                        Tutti gli utenti che non sono amministratori, dalla webapp e dall’app, verranno sospesi subito e non
                        potranno accedere finché non ripristini gli accessi.
                      </p>
                      <p>Il loro login resta valido: allo sblocco continueranno da dove erano.</p>
                    </>
                  )}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            {isMaintenance && (
              <FormField
                label="Avviso per gli utenti (facoltativo)"
                htmlFor="maintenance-message"
                description="Compare nella barra in cima alle pagine, per tutti."
              >
                <Textarea
                  id="maintenance-message"
                  rows={2}
                  maxLength={MAINTENANCE_NOTE_MAX}
                  placeholder="Es. fino alle 18:00"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  disabled={pending}
                />
              </FormField>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>Annulla</AlertDialogCancel>
              {isMaintenance && active && (
                <Button
                  variant="outline"
                  disabled={pending || message.trim() === savedMessage}
                  onClick={() => run(() => setMaintenanceModeAction({ active: true, message }), 'Avviso aggiornato')}
                >
                  Aggiorna avviso
                </Button>
              )}
              <AlertDialogAction
                variant={active || isMaintenance ? 'default' : 'destructive'}
                disabled={pending}
                onClick={(e) => {
                  e.preventDefault();
                  toggle();
                }}
              >
                {pending ? <Spinner /> : isMaintenance ? <Wrench /> : active ? <ShieldCheck /> : <ShieldAlert />}
                {isMaintenance
                  ? active
                    ? 'Termina la manutenzione'
                    : 'Attiva la manutenzione'
                  : active
                    ? 'Ripristina gli accessi'
                    : 'Blocca gli accessi'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
