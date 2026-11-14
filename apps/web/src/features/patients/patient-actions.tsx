'use client';

import { patientExportSchema, type PatientDTO, type PatientExportInput } from '@alby/shared';
import { Download, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useState, useTransition, type FormEvent } from 'react';
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
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { FieldGroup } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useZodForm } from '@/lib/use-zod-form';
import { deletePatientAction, updatePatientAction } from '@/server/actions/patients';
import { PatientFormDialog } from './patient-form-dialog';

const EXPORT_DEFAULTS: PatientExportInput = { from: '', to: '', pdf: false, images: false };

/**
 * Pulsanti "Scarica", "Modifica" ed "Elimina" della scheda: l'unica parte interattiva dell'intestazione.
 * "Scarica" (per chiunque veda il paziente) chiede periodo e contenuto della cartella clinica da scaricare.
 */
export function PatientActions({ patient, canDelete }: { patient: PatientDTO; canDelete: boolean }) {
  const [exporting, setExporting] = useState(false);
  const exportForm = useZodForm(patientExportSchema, EXPORT_DEFAULTS);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, startDelete] = useTransition();
  const name = `${patient.firstName} ${patient.lastName}`;

  function download(e: FormEvent) {
    e.preventDefault();
    const data = exportForm.validate();
    if (!data) return;
    const query = new URLSearchParams();
    if (data.from) query.set('dal', data.from);
    if (data.to) query.set('al', data.to);
    if (data.pdf) query.set('pdf', '1');
    if (data.images) query.set('immagini', '1');
    // Il server risponde con un allegato: il browser lo salva senza lasciare la pagina.
    window.location.assign(`/api/cartella/${patient.id}?${query}`);
    setExporting(false);
    toast.success('Download della cartella clinica avviato');
  }

  return (
    <>
      <Button variant="outline" onClick={() => setExporting(true)}>
        <Download />
        Scarica
      </Button>
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

      <Dialog open={exporting} onOpenChange={setExporting}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={download} noValidate className="grid gap-6">
            <DialogHeader>
              <DialogTitle>Scarica la cartella clinica</DialogTitle>
              <DialogDescription>
                Un archivio ZIP con il riepilogo in PDF di dati anagrafici, terapie, referti e immagini del periodo scelto.
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className="grid gap-4 sm:grid-cols-2">
              <FormField label="Dal" htmlFor="export-from" error={exportForm.errors.from} description="Vuoto: dal primo referto">
                <Input type="date" {...exportForm.text('from')} id="export-from" max={exportForm.values.to || undefined} />
              </FormField>
              <FormField label="Al" htmlFor="export-to" error={exportForm.errors.to} description="Vuoto: fino a oggi">
                <Input type="date" {...exportForm.text('to')} id="export-to" min={exportForm.values.from || undefined} />
              </FormField>
            </FieldGroup>
            <div className="grid gap-3">
              <label className="flex items-start gap-2 text-sm">
                <Checkbox className="mt-0.5" checked={exportForm.values.pdf === true} onCheckedChange={(c) => exportForm.setValue('pdf', c === true)} />
                <span>
                  Aggiungi i PDF dei referti
                  <span className="block text-muted-foreground">I documenti originali da cui sono stati inseriti i referti.</span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <Checkbox className="mt-0.5" checked={exportForm.values.images === true} onCheckedChange={(c) => exportForm.setValue('images', c === true)} />
                <span>
                  Aggiungi le immagini
                  <span className="block text-muted-foreground">I file DICOM di TAC, risonanze e radiografie: possono occupare molto spazio.</span>
                </span>
              </label>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Annulla
                </Button>
              </DialogClose>
              <Button type="submit">
                <Download />
                Scarica
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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
