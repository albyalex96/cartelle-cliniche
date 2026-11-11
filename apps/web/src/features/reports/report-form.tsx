'use client';

import {
  isOutOfRange,
  parseItalianNumber,
  REPORT_KIND_HINTS,
  REPORT_KIND_LABELS,
  REPORT_KINDS,
  reportInputSchema,
  type ReportDraftDTO,
  type ReportKind,
} from '@alby/shared';
import { Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRef, useState, useTransition, type FormEvent } from 'react';
import { toast } from 'sonner';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FieldGroup } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useZodForm } from '@/lib/use-zod-form';
import { cn } from '@/lib/utils';
import {
  createReportAction,
  discardReportPdfAction,
  updateReportAction,
} from '@/server/actions/reports';

type Values = ReportDraftDTO['values'];
type Row = Values['results'][number];

export type ReportFormMode =
  /** Nuovo referto, eventualmente da un PDF appena caricato (che "Annulla" elimina). */
  | { type: 'create'; patientId: string; fileId: string | null; parser: ReportDraftDTO['parser']; cancelHref: string }
  | { type: 'edit'; reportId: string; cancelHref: string };

const emptyRow = (section = ''): Row => ({ section, name: '', value: '', unit: '', referenceRange: '', outOfRange: null });

/** "Fuori range" mostrato: quello scelto dall'utente, altrimenti calcolato da valore e intervallo. */
const shownOutOfRange = (r: Row) =>
  r.outOfRange ?? isOutOfRange(parseItalianNumber(r.value), r.referenceRange || undefined) ?? false;

export function ReportForm({ mode, initial }: { mode: ReportFormMode; initial: Values }) {
  const form = useZodForm(reportInputSchema, initial);
  const [pending, startTransition] = useTransition();
  const [discarding, startDiscard] = useTransition();
  const values = form.values as Values;
  const isLab = values.kind === 'LABORATORIO';

  // Chiavi stabili per le righe (non hanno un id finché non vengono salvate).
  const nextKey = useRef(initial.results.length);
  const [keys, setKeys] = useState(() => initial.results.map((_, i) => i));

  const setRows = (rows: Row[]) => form.setValue('results', rows);
  const updateRow = (i: number, patch: Partial<Row>) => setRows(values.results.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const addRow = () => {
    setRows([...values.results, emptyRow(values.results.at(-1)?.section ?? '')]);
    setKeys((k) => [...k, nextKey.current++]);
  };
  const removeRow = (i: number) => {
    setRows(values.results.filter((_, j) => j !== i));
    setKeys((k) => k.filter((_, j) => j !== i));
  };

  function submit(e: FormEvent) {
    e.preventDefault();
    const data = form.validate();
    if (!data) {
      toast.error('Controlla i campi evidenziati');
      return;
    }
    // I valori contano solo per gli esami di laboratorio.
    const payload = { ...data, results: data.kind === 'LABORATORIO' ? data.results : [] };
    startTransition(async () => {
      // In caso di successo il server porta alla pagina del referto.
      const result =
        mode.type === 'create'
          ? await createReportAction(mode.patientId, payload, { fileId: mode.fileId, parser: mode.parser })
          : await updateReportAction(mode.reportId, payload);
      if (!result.ok && !form.applyResult(result)) toast.error(result.message);
      else if (!result.ok) toast.error('Controlla i campi evidenziati');
    });
  }

  function discard() {
    if (mode.type !== 'create' || !mode.fileId) return;
    const fileId = mode.fileId;
    startDiscard(async () => {
      const result = await discardReportPdfAction(fileId);
      if (!result.ok) toast.error(result.message);
    });
  }

  const busy = pending || discarding;
  const rowError = (i: number, field: keyof Row) => form.errors[`results.${i}.${field}`];

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Dati del referto</CardTitle>
          <CardDescription>Controlla ciò che è stato letto dal PDF e correggi se serve.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <FormField label="Tipo" htmlFor="kind" error={form.errors.kind}>
              <Select value={values.kind} onValueChange={(v) => form.setValue('kind', v as ReportKind)}>
                <SelectTrigger id="kind" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REPORT_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {REPORT_KIND_LABELS[k]}
                      <span className="text-muted-foreground"> · {REPORT_KIND_HINTS[k]}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Data dell’esame" htmlFor="examDate" error={form.errors.examDate}>
              <Input type="date" max={new Date().toISOString().slice(0, 10)} {...form.text('examDate')} />
            </FormField>
            <FormField
              label="Titolo"
              htmlFor="title"
              error={form.errors.title}
              description={isLab ? 'Ad esempio “Esami del sangue” o “Controllo tiroide”.' : 'Ad esempio “RM lombo-sacrale”.'}
              className="sm:col-span-2"
            >
              <Input autoComplete="off" {...form.text('title')} />
            </FormField>
            <FormField label="Struttura" htmlFor="facility" error={form.errors.facility} description="Ospedale, laboratorio o studio.">
              <Input autoComplete="off" {...form.text('facility')} />
            </FormField>
            <FormField label="Numero del referto" htmlFor="reportNumber" error={form.errors.reportNumber}>
              <Input autoComplete="off" {...form.text('reportNumber')} />
            </FormField>
            <FormField label="Medico" htmlFor="doctor" error={form.errors.doctor}>
              <Input autoComplete="off" {...form.text('doctor')} />
            </FormField>
            <FormField label="Qualifica" htmlFor="doctorRole" error={form.errors.doctorRole}>
              <Input autoComplete="off" placeholder="Es. Specialista radiologo" {...form.text('doctorRole')} />
            </FormField>
            <FormField label="Data del referto" htmlFor="reportDate" error={form.errors.reportDate} description="Se diversa da quella dell’esame.">
              <Input type="date" max={new Date().toISOString().slice(0, 10)} {...form.text('reportDate')} />
            </FormField>
          </FieldGroup>
        </CardContent>
      </Card>

      {isLab && (
        <Card>
          <CardHeader>
            <CardTitle>Valori</CardTitle>
            <CardDescription>
              {values.results.length
                ? `${values.results.length} valori. “Fuori” si calcola da solo dall’intervallo: puoi comunque cambiarlo.`
                : 'Nessun valore: aggiungili a mano.'}
            </CardDescription>
            <CardAction>
              <Button type="button" variant="outline" size="sm" onClick={addRow}>
                <Plus />
                Aggiungi
              </Button>
            </CardAction>
          </CardHeader>
          {values.results.length > 0 && (
            <CardContent className="px-0">
              <div className="overflow-x-auto px-6">
                <table className="w-full min-w-[760px] border-separate border-spacing-y-1 text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="w-[16%] pb-1 font-medium">Sezione</th>
                      <th className="w-[28%] pb-1 font-medium">Esame</th>
                      <th className="w-[13%] pb-1 font-medium">Valore</th>
                      <th className="w-[13%] pb-1 font-medium">Unità</th>
                      <th className="w-[18%] pb-1 font-medium">Riferimento</th>
                      <th className="pb-1 text-center font-medium">Fuori</th>
                      <th className="pb-1" />
                    </tr>
                  </thead>
                  <tbody>
                    {values.results.map((r, i) => {
                      const out = shownOutOfRange(r);
                      const cell = (field: 'section' | 'name' | 'value' | 'unit' | 'referenceRange', label: string) => (
                        <td className="pr-1.5">
                          <Input
                            aria-label={`${label}, riga ${i + 1}`}
                            aria-invalid={rowError(i, field) ? true : undefined}
                            title={rowError(i, field)}
                            className={cn('h-8', field === 'value' && 'font-medium tabular-nums', field === 'value' && out && 'text-destructive')}
                            value={r[field]}
                            onChange={(e) =>
                              // Se cambiano valore o intervallo, il "fuori range" torna automatico.
                              updateRow(i, field === 'value' || field === 'referenceRange' ? { [field]: e.target.value, outOfRange: null } : { [field]: e.target.value })
                            }
                          />
                        </td>
                      );
                      return (
                        <tr key={keys[i]} className={cn(out && '[&_input]:bg-destructive/5')}>
                          {cell('section', 'Sezione')}
                          {cell('name', 'Esame')}
                          {cell('value', 'Valore')}
                          {cell('unit', 'Unità')}
                          {cell('referenceRange', 'Riferimento')}
                          <td className="px-2 text-center">
                            <Switch
                              aria-label={`Fuori range, riga ${i + 1}`}
                              checked={out}
                              onCheckedChange={(checked) => updateRow(i, { outOfRange: checked })}
                            />
                          </td>
                          <td>
                            <Button type="button" variant="ghost" size="icon" className="size-8" aria-label={`Elimina riga ${i + 1}`} onClick={() => removeRow(i)}>
                              <Trash2 />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {form.errors.results && <p className="px-6 text-sm text-destructive">{form.errors.results}</p>}
            </CardContent>
          )}
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{isLab ? 'Commento' : 'Testo del referto'}</CardTitle>
          {isLab && <CardDescription>Eventuale commento del laboratorio (facoltativo).</CardDescription>}
        </CardHeader>
        <CardContent>
          <FormField label={<span className="sr-only">{isLab ? 'Commento' : 'Testo del referto'}</span>} htmlFor="body" error={form.errors.body}>
            <Textarea rows={isLab ? 3 : 12} className="leading-relaxed" {...form.text('body')} />
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Note personali</CardTitle>
          <CardDescription>Ad esempio: “da far vedere al medico di base”, sintomi, terapia in corso.</CardDescription>
        </CardHeader>
        <CardContent>
          <FormField label={<span className="sr-only">Note personali</span>} htmlFor="notes" error={form.errors.notes}>
            <Textarea rows={3} {...form.text('notes')} />
          </FormField>
        </CardContent>
      </Card>

      {/* Pulsanti sempre visibili in fondo allo schermo. */}
      <div className="sticky bottom-0 z-10 -mx-1 flex justify-end gap-2 border-t bg-background/90 px-1 py-3 backdrop-blur">
        {mode.type === 'create' && mode.fileId ? (
          <Button type="button" variant="outline" disabled={busy} onClick={discard}>
            {discarding && <Spinner />}
            Annulla importazione
          </Button>
        ) : (
          <Button type="button" variant="outline" disabled={busy} asChild>
            <Link href={mode.cancelHref}>Annulla</Link>
          </Button>
        )}
        <Button type="submit" disabled={busy}>
          {pending && <Spinner />}
          {mode.type === 'create' ? 'Salva referto' : 'Salva modifiche'}
        </Button>
      </div>
    </form>
  );
}
