'use client';

import { Ban, LockOpen } from 'lucide-react';
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
import { setIpBlockedAction } from '@/server/actions/security';

export function IpBlockButton({ ip, blocked, own }: { ip: string; blocked: boolean; own?: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const label = blocked ? 'Sblocca' : 'Blocca';

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`${label} ${ip}`}
          title={own && !blocked ? 'È il tuo indirizzo IP' : label}
          disabled={own && !blocked}
          className={blocked ? 'text-destructive' : 'text-muted-foreground hover:text-destructive'}
        >
          {blocked ? <LockOpen /> : <Ban />}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {label} {ip}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {blocked
              ? 'Da questo indirizzo si potrà di nuovo accedere.'
              : 'Nessuno potrà più accedere da questo indirizzo, dal sito o dall’app. Le sessioni aperte da qui verranno chiuse.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Annulla</AlertDialogCancel>
          <AlertDialogAction
            variant={blocked ? 'default' : 'destructive'}
            disabled={pending}
            onClick={(e) => {
              e.preventDefault();
              startTransition(async () => {
                const result = await setIpBlockedAction(ip, !blocked);
                if (!result.ok) return void toast.error(result.message);
                toast.success(blocked ? 'Indirizzo IP sbloccato' : 'Indirizzo IP bloccato');
                setOpen(false);
              });
            }}
          >
            {pending && <Spinner />}
            {label}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
