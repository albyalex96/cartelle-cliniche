'use client';

import type { PatientDTO } from '@alby/shared';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Spinner } from '@/components/ui/spinner';
import { deletePatientAction, updatePatientAction } from '@/server/actions/patients';
import { PatientFormDialog } from './patient-form-dialog';

/** Pulsanti "Modifica" ed "Elimina" della scheda: l'unica parte interattiva dell'intestazione. */
export function PatientActions({ patient, canDelete }: { patient: PatientDTO; canDelete: boolean }) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, startDelete] = useTransition();
  const name = `${patient.firstName} ${patient.lastName}`;

  return (
    <>
      {patient.canEdit && (
        <Button variant="outline" onClick={() => setEditing(true)}>
          <Pencil />
          Modifica
        </Button>
      )}
      {canDelete && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" aria-label="Altre azioni">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
              <Trash2 />
              Elimina paziente
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <PatientFormDialog
        open={editing}
        onOpenChange={setEditing}
        patient={patient}
        save={(data) => updatePatientAction(patient.id, data)}
        onSaved={() => toast.success('Modifiche salvate')}
      />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare {name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Verranno eliminati definitivamente la scheda e tutti i dati collegati. L’operazione non si può annullare.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                startDelete(async () => {
                  // In caso di successo il server reindirizza all'elenco.
                  const result = await deletePatientAction(patient.id);
                  if (!result.ok) toast.error(result.message);
                  else toast.success(`${name} eliminato`);
                });
              }}
            >
              {deleting && <Spinner />}
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
