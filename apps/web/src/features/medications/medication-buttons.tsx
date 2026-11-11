'use client';

import type { MedicationDTO } from '@alby/shared';
import { CircleStop, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
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
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Spinner } from '@/components/ui/spinner';
import { createMedicationAction, deleteMedicationAction, stopMedicationAction, updateMedicationAction } from '@/server/actions/medications';
import { MedicationFormDialog } from './medication-form-dialog';

/** "Aggiungi farmaco": apre il form vuoto. */
export function AddMedicationButton({ patientId, variant = 'default' }: { patientId: string; variant?: 'default' | 'outline' }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <Plus />
        Aggiungi farmaco
      </Button>
      <MedicationFormDialog open={open} onOpenChange={setOpen} save={(data) => createMedicationAction(patientId, data)} />
    </>
  );
}

/** Menu di una riga della terapia: modifica, concludi oggi, elimina. */
export function MedicationRowActions({ medication }: { medication: MedicationDTO }) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  function stop() {
    startTransition(async () => {
      const result = await stopMedicationAction(medication.id);
      if (result.ok) toast.success(`${medication.name}: terapia conclusa`);
      else toast.error(result.message);
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label={`Azioni per ${medication.name}`} disabled={pending}>
            {pending ? <Spinner /> : <MoreHorizontal />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditing(true)}>
            <Pencil />
            Modifica
          </DropdownMenuItem>
          {medication.active && (
            <DropdownMenuItem onSelect={stop}>
              <CircleStop />
              Concludi oggi
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
            <Trash2 />
            Elimina
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <MedicationFormDialog open={editing} onOpenChange={setEditing} medication={medication} save={(data) => updateMedicationAction(medication.id, data)} />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare {medication.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Il farmaco sparirà anche dallo storico delle terapie. Se il paziente ha solo smesso di prenderlo, usa invece “Concludi oggi”.
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
                  const result = await deleteMedicationAction(medication.id);
                  if (!result.ok) toast.error(result.message);
                  else {
                    toast.success('Farmaco eliminato');
                    setConfirmDelete(false);
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
    </>
  );
}
