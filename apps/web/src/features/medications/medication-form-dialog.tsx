'use client';

import { medicationInputSchema, type MedicationDTO, type MedicationInput } from '@alby/shared';
import { BookOpenCheck, X } from 'lucide-react';
import { useEffect, useTransition, type FormEvent } from 'react';
import { toast } from 'sonner';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useZodForm } from '@/lib/use-zod-form';
import type { ActionResult } from '@/server/action-result';
import { DrugSearchInput } from './drug-search-input';

const EMPTY: MedicationInput = {
  name: '',
  activeIngredient: '',
  aic: '',
  dosage: '',
  frequency: '',
  asNeeded: false,
  reason: '',
  prescriber: '',
  startDate: '',
  endDate: '',
  notes: '',
};

const fromMedication = (m?: MedicationDTO): MedicationInput =>
  m
    ? {
        name: m.name,
        activeIngredient: m.activeIngredient ?? '',
        aic: m.aic ?? '',
        dosage: m.dosage ?? '',
        frequency: m.frequency ?? '',
        asNeeded: m.asNeeded,
        reason: m.reason ?? '',
        prescriber: m.prescriber ?? '',
        startDate: m.startDate ?? '',
        endDate: m.endDate ?? '',
        notes: m.notes ?? '',
      }
    : { ...EMPTY, startDate: new Date().toISOString().slice(0, 10) };

const FREQUENCIES = [
  '1 volta al giorno',
  '2 volte al giorno',
  '3 volte al giorno',
  'al mattino',
  'alla sera',
  'mattina e sera',
  'a colazione',
  'a pranzo',
  'a cena',
  'prima di dormire',
  'ogni 8 ore',
  'ogni 12 ore',
  'a giorni alterni',
  '1 volta alla settimana',
];

interface MedicationFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  medication?: MedicationDTO;
  save: (data: unknown) => Promise<ActionResult>;
}

export function MedicationFormDialog({ open, onOpenChange, medication, save }: MedicationFormDialogProps) {
  const form = useZodForm(medicationInputSchema, fromMedication(medication));
  const [pending, startTransition] = useTransition();
  const { reset, values, setValue } = form;

  useEffect(() => {
    if (open) reset(fromMedication(medication));
  }, [open, medication, reset]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const data = form.validate();
    if (!data) return;
    startTransition(async () => {
      const result = await save(data);
      if (result.ok) {
        onOpenChange(false);
        toast.success(medication ? 'Modifiche salvate' : 'Farmaco aggiunto');
      } else if (!form.applyResult(result)) {
        toast.error(result.message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={submit} noValidate className="grid gap-6">
          <DialogHeader>
            <DialogTitle>{medication ? 'Modifica farmaco' : 'Aggiungi farmaco'}</DialogTitle>
            <DialogDescription>
              Cerca il farmaco per nome o principio attivo, oppure scrivilo a mano. Lascia vuota la data di fine se la terapia è in corso.
            </DialogDescription>
          </DialogHeader>

          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <FormField label="Farmaco" htmlFor="name" error={form.errors.name} className="sm:col-span-2">
              <DrugSearchInput
                id="name"
                value={values.name ?? ''}
                invalid={!!form.errors.name}
                autoFocus={!medication}
                onType={(v) => {
                  setValue('name', v);
                  if (values.aic) setValue('aic', '');
                }}
                onPick={(d) => {
                  setValue('name', d.name);
                  setValue('aic', d.aic);
                  if (d.activeIngredient) setValue('activeIngredient', d.activeIngredient);
                }}
              />
              {values.aic && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <BookOpenCheck className="size-3.5" />
                  Dall’elenco AIFA (codice {values.aic}): dalla terapia potrai leggere il foglietto illustrativo.
                  <Button type="button" variant="ghost" size="icon-xs" aria-label="Scollega dall’elenco AIFA" onClick={() => setValue('aic', '')}>
                    <X />
                  </Button>
                </p>
              )}
            </FormField>
            <FormField label="Principio attivo" htmlFor="activeIngredient" error={form.errors.activeIngredient} className="sm:col-span-2">
              <Input autoComplete="off" {...form.text('activeIngredient')} />
            </FormField>
            <FormField label="Dose" htmlFor="dosage" error={form.errors.dosage} description="Ad esempio “1 compressa”, “20 gocce”.">
              <Input autoComplete="off" {...form.text('dosage')} />
            </FormField>
            <FormField label="Quando" htmlFor="frequency" error={form.errors.frequency} description="Scegli o scrivi liberamente.">
              <Input autoComplete="off" list="medication-frequencies" {...form.text('frequency')} />
              <datalist id="medication-frequencies">
                {FREQUENCIES.map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
            </FormField>
            <Field orientation="horizontal" className="sm:col-span-2">
              <Switch id="asNeeded" checked={!!values.asNeeded} onCheckedChange={(v) => setValue('asNeeded', v)} />
              <div className="grid gap-0.5">
                <FieldLabel htmlFor="asNeeded">Solo al bisogno</FieldLabel>
                <FieldDescription>Per esempio un antidolorifico da prendere solo in caso di dolore.</FieldDescription>
              </div>
            </Field>
            <FormField label="Per cosa" htmlFor="reason" error={form.errors.reason}>
              <Input autoComplete="off" placeholder="Es. pressione alta" {...form.text('reason')} />
            </FormField>
            <FormField label="Prescritto da" htmlFor="prescriber" error={form.errors.prescriber}>
              <Input autoComplete="off" {...form.text('prescriber')} />
            </FormField>
            <FormField label="Dal" htmlFor="startDate" error={form.errors.startDate}>
              <Input type="date" {...form.text('startDate')} />
            </FormField>
            <FormField label="Al" htmlFor="endDate" error={form.errors.endDate} description="Vuoto = terapia in corso.">
              <Input type="date" min={values.startDate || undefined} {...form.text('endDate')} />
            </FormField>
            <FormField label="Note" htmlFor="notes" error={form.errors.notes} className="sm:col-span-2">
              <Textarea rows={3} placeholder="Es. a stomaco pieno, non insieme al latte…" {...form.text('notes')} />
            </FormField>
          </FieldGroup>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Annulla
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending && <Spinner />}
              {medication ? 'Salva modifiche' : 'Aggiungi'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
