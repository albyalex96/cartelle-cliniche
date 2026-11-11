'use client';

import { Trash2 } from 'lucide-react';
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
import { deleteReportAction } from '@/server/actions/reports';

export function DeleteReportButton({ reportId, hasFile, compact = false }: { reportId: string; hasFile: boolean; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant={compact ? 'ghost' : 'outline'}
          size={compact ? 'icon-sm' : 'icon'}
          aria-label="Elimina referto"
          title="Elimina"
          className={compact ? 'text-muted-foreground hover:text-destructive' : undefined}
        >
          <Trash2 />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Eliminare il referto?</AlertDialogTitle>
          <AlertDialogDescription>
            Verranno eliminati i dati del referto{hasFile ? ' e il PDF originale' : ''}. L’operazione non si può annullare.
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
                // In caso di successo il server torna alla scheda del paziente.
                const result = await deleteReportAction(reportId);
                if (!result.ok) toast.error(result.message);
                else toast.success('Referto eliminato');
              });
            }}
          >
            {pending && <Spinner />}
            Elimina
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
