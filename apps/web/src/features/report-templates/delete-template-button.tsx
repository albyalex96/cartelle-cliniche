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
import { deleteReportTemplateAction } from '@/server/actions/report-templates';

export function DeleteTemplateButton({ id, name, disabled }: { id: string; name: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Elimina ${name}`}
          title={disabled ? 'Deve restare almeno un tipo di referto' : 'Elimina'}
          disabled={disabled}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Eliminare «{name}»?</AlertDialogTitle>
          <AlertDialogDescription>
            Non si potrà più scegliere per i nuovi referti. I referti già inseriti con questo tipo non cambiano: restano leggibili con i campi con cui
            sono stati salvati.
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
                const result = await deleteReportTemplateAction(id);
                if (!result.ok) return void toast.error(result.message);
                toast.success('Tipo di referto eliminato');
                setOpen(false);
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
