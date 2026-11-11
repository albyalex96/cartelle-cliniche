'use client';

import { BLOOD_TYPES, SEXES, SEX_LABELS, patientInputSchema, type PatientDTO, type PatientInput } from '@alby/shared';
import { useEffect, useTransition, type FormEvent } from 'react';
import { toast } from 'sonner';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FieldGroup } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { useZodForm } from '@/lib/use-zod-form';
import type { ActionResult } from '@/server/action-result';

const NONE = '__none';

const EMPTY: PatientInput = {
  firstName: '',
  lastName: '',
  birthDate: '',
  sex: '',
  fiscalCode: '',
  bloodType: '',
  phone: '',
  email: '',
  notes: '',
};

function fromPatient(p?: PatientDTO): PatientInput {
  if (!p) return EMPTY;
  return {
    firstName: p.firstName,
    lastName: p.lastName,
    birthDate: p.birthDate ?? '',
    sex: p.sex ?? '',
    fiscalCode: p.fiscalCode ?? '',
    bloodType: p.bloodType ?? '',
    phone: p.phone ?? '',
    email: p.email ?? '',
    notes: p.notes ?? '',
  };
}

interface PatientFormDialogProps<T> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patient?: PatientDTO;
  /** Server Action da chiamare con i dati validati. */
  save: (data: unknown) => Promise<ActionResult<T>>;
  onSaved: (data: T) => void;
}

export function PatientFormDialog<T>({ open, onOpenChange, patient, save, onSaved }: PatientFormDialogProps<T>) {
  const form = useZodForm(patientInputSchema, fromPatient(patient));
  const [pending, startTransition] = useTransition();
  const { reset } = form;

  useEffect(() => {
    if (open) reset(fromPatient(patient));
  }, [open, patient, reset]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const data = form.validate();
    if (!data) return;
    startTransition(async () => {
      const result = await save(data);
      if (result.ok) {
        onOpenChange(false);
        onSaved(result.data);
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
            <DialogTitle>{patient ? 'Modifica paziente' : 'Nuovo paziente'}</DialogTitle>
            <DialogDescription>Solo nome e cognome sono obbligatori: gli altri dati puoi completarli in seguito.</DialogDescription>
          </DialogHeader>

          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <FormField label="Nome" htmlFor="firstName" error={form.errors.firstName}>
              <Input autoFocus autoComplete="off" {...form.text('firstName')} />
            </FormField>
            <FormField label="Cognome" htmlFor="lastName" error={form.errors.lastName}>
              <Input autoComplete="off" {...form.text('lastName')} />
            </FormField>
            <FormField label="Data di nascita" htmlFor="birthDate" error={form.errors.birthDate}>
              <Input type="date" max={new Date().toISOString().slice(0, 10)} {...form.text('birthDate')} />
            </FormField>
            <FormField label="Sesso" htmlFor="sex" error={form.errors.sex}>
              <Select
                value={form.values.sex || NONE}
                onValueChange={(v) => form.setValue('sex', v === NONE ? '' : (v as PatientInput['sex']))}
              >
                <SelectTrigger id="sex" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {SEXES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {SEX_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Codice fiscale" htmlFor="fiscalCode" error={form.errors.fiscalCode}>
              <Input autoComplete="off" maxLength={16} className="font-mono uppercase" {...form.text('fiscalCode')} />
            </FormField>
            <FormField label="Gruppo sanguigno" htmlFor="bloodType" error={form.errors.bloodType}>
              <Select
                value={form.values.bloodType || NONE}
                onValueChange={(v) => form.setValue('bloodType', v === NONE ? '' : (v as PatientInput['bloodType']))}
              >
                <SelectTrigger id="bloodType" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Non noto</SelectItem>
                  {BLOOD_TYPES.map((b) => (
                    <SelectItem key={b} value={b}>
                      {b}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Telefono" htmlFor="phone" error={form.errors.phone}>
              <Input type="tel" autoComplete="off" {...form.text('phone')} />
            </FormField>
            <FormField label="Email" htmlFor="email" error={form.errors.email}>
              <Input type="email" autoComplete="off" {...form.text('email')} />
            </FormField>
            <FormField
              label="Note"
              htmlFor="notes"
              error={form.errors.notes}
              description="Ad esempio allergie, patologie croniche, contatti di emergenza."
              className="sm:col-span-2"
            >
              <Textarea rows={4} {...form.text('notes')} />
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
              {patient ? 'Salva modifiche' : 'Crea paziente'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
