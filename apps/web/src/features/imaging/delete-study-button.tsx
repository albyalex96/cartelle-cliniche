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
import { deleteImagingStudyAction } from '@/server/actions/imaging';

export function DeleteStudyButton({
  studyId,
  imageCount,
  onDeleted,
}: {
  studyId: string;
  imageCount: number;
  /** Chiamata a eliminazione avvenuta (es. per togliere lo studio da una selezione). */
  onDeleted?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" aria-label="Elimina studio" title="Elimina">
          <Trash2 />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Eliminare le immagini?</AlertDialogTitle>
          <AlertDialogDescription>
            Verranno eliminate definitivamente {imageCount === 1 ? 'l’immagine' : `le ${imageCount} immagini`} di questo studio. Potrai ricaricarle dal
            CD.
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
                const result = await deleteImagingStudyAction(studyId);
                if (!result.ok) toast.error(result.message);
                else {
                  toast.success('Immagini eliminate');
                  setOpen(false);
                  onDeleted?.();
                }
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
