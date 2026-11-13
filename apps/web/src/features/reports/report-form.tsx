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
  type ScanReadDTO,
} from '@alby/shared';
import { Info, Plus, ScanText, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import { FormField } from '@/components/form-field';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FieldGroup } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useZodForm } from '@/lib/use-zod-form';
import { cn } from '@/lib/utils';
import { AiImportDialog } from './ai-import-dialog';
import { ReportImagesField } from './report-images-field';
import { useScanBridge } from './scan-bridge';
import { SCAN_FIELDS, sameTarget, targetLabel, type ScanField, type ScanTarget } from './scan-fields';
import type { ReportImaging } from './report-imaging';
import {
  createReportAction,
  discardReportPdfAction,
  updateReportAction,
} from '@/server/actions/reports';

type Values = ReportDraftDTO['values'];
type Row = Values['results'][number];

export type ReportFormMode =
  /**
   * Nuovo referto, eventualmente da un PDF appena caricato (che "Annulla" elimina).
   * `onCancel`: nel modal "Inserisci referto" il bottone Annulla chiude il modal (che decide cosa fare del PDF).
   */
  | { type: 'create'; patientId: string; fileId: string | null; parser: ReportDraftDTO['parser']; cancelHref: string; onCancel?: () => void }
  | { type: 'edit'; reportId: string; cancelHref: string };

/**
 * Bottone accanto a un campo (o alla tabella dei valori) per leggerne il testo da una zona della
 * scansione: avvia la selezione sul documento. Compare solo se la scansione è mostrata accanto al form.
 */
function ScanButton({ target, label = `Leggi «${targetLabel(target)}» dalla scansione`, children }: { target: ScanTarget; label?: string; children?: ReactNode }) {
  const bridge = useScanBridge();
  if (!bridge?.scanReady) return null;
  const active = sameTarget(bridge.selection, target);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={active ? 'default' : 'outline'}
          size={children ? 'sm' : 'icon'}
          className={children ? undefined : 'shrink-0'}
          aria-label={label}
          aria-pressed={active}
          onClick={() => (active ? bridge.cancelSelection() : bridge.startSelection(target))}
        >
          <ScanText />
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{active ? 'Annulla la selezione (Esc)' : label}</TooltipContent>
    </Tooltip>
  );
}

/** Campo del form con, accanto, il bottone per leggerlo dalla scansione (se c'è). */
function WithScan({ field, children }: { field: ScanField; children: ReactNode }) {
  return (
    <div className="flex items-start gap-1.5">
      <div className="min-w-0 flex-1">{children}</div>
      <ScanButton target={{ kind: 'field', field }} />
    </div>
  );
}

const emptyRow = (section = ''): Row => ({ section, name: '', value: '', unit: '', referenceRange: '', outOfRange: null });

/** "Fuori range" mostrato: quello scelto dall'utente, altrimenti calcolato da valore e intervallo. */
const shownOutOfRange = (r: Row) =>
  r.outOfRange ?? isOutOfRange(parseItalianNumber(r.value), r.referenceRange || undefined) ?? false;

export function ReportForm({
  mode,
  initial,
  imaging,
  onDirtyChange,
}: {
  mode: ReportFormMode;
  initial: Values;
  imaging: ReportImaging;
  /** Avvisa quando il form viene modificato (il modal chiede conferma prima di chiudersi). */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const form = useZodForm(reportInputSchema, initial);
  const [pending, startTransition] = useTransition();
  const [discarding, startDiscard] = useTransition();
  const values = form.values as Values;
  const isLab = values.kind === 'LABORATORIO';
  // Studi di immagini collegati: salvati insieme al referto.
  const [studyIds, setStudyIds] = useState(imaging.linkedIds);

  // Chiavi stabili per le righe (non hanno un id finché non vengono salvate).
  const nextKey = useRef(initial.results.length);
  const [keys, setKeys] = useState(() => initial.results.map((_, i) => i));

  // Righe lette da una scansione con poca sicurezza e non ancora toccate (per chiave): evidenziate.
  const [uncertainKeys, setUncertainKeys] = useState<ReadonlySet<number>>(new Set());
  const clearUncertain = (key: number | undefined) =>
    setUncertainKeys((set) => {
      if (key === undefined || !set.has(key)) return set;
      const next = new Set(set);
      next.delete(key);
      return next;
    });

  const setRows = (rows: Row[]) => form.setValue('results', rows);
  const updateRow = (i: number, patch: Partial<Row>) => {
    setRows(values.results.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    clearUncertain(keys[i]);
  };
  const addRow = () => {
    setRows([...values.results, emptyRow(values.results.at(-1)?.section ?? '')]);
    setKeys((k) => [...k, nextKey.current++]);
  };
  const removeRow = (i: number) => {
    setRows(values.results.filter((_, j) => j !== i));
    setKeys((k) => k.filter((_, j) => j !== i));
    clearUncertain(keys[i]);
  };

  // ── Scansioni: il testo letto da una zona del documento (vedi ScanViewer) arriva qui. ──
  const bridge = useScanBridge();
  // Lettore salvato con il referto: diventa quello della scansione appena si usa l'OCR.
  const [parser, setParser] = useState(mode.type === 'create' ? mode.parser : null);
  const [scanNotes, setScanNotes] = useState<string[]>([]);

  /** Aggiunge righe in fondo alla tabella, segnando quelle incerte. */
  function appendRows(rows: Row[], uncertain: number[]) {
    const newKeys = rows.map(() => nextKey.current++);
    setRows([...values.results, ...rows]);
    setKeys((k) => [...k, ...newKeys]);
    setUncertainKeys((set) => new Set([...set, ...uncertain.map((i) => newKeys[i]!)]));
  }

  function receiveScan(result: ScanReadDTO, target: ScanTarget) {
    setParser(result.parser);
    if (result.mode === 'table') {
      if (!result.rows.length) {
        toast.info('Nessun valore riconosciuto: includi nel riquadro almeno nome dell’esame e valore, sulla stessa riga.');
        return;
      }
      if (values.kind !== 'LABORATORIO') form.setValue('kind', 'LABORATORIO');
      appendRows(result.rows, result.uncertain);
      const doubts = result.uncertain.length ? `, ${result.uncertain.length} da verificare (evidenziati)` : '';
      toast.success(`${result.rows.length} valori aggiunti${doubts}`);
      return;
    }
    if (result.mode === 'page') {
      // Si riempiono solo i campi ancora vuoti: ciò che è già stato scritto non si tocca.
      const next = result.values;
      for (const key of Object.keys(SCAN_FIELDS) as (keyof typeof SCAN_FIELDS)[]) {
        if (!values[key] && next[key]) form.setValue(key, next[key]);
      }
      if (!values.results.length) form.setValue('kind', next.kind);
      if (next.results.length) appendRows(next.results, result.uncertain);
      setScanNotes(result.warnings);
      toast.success(`Pagina letta (affidabilità ${result.confidence}%): controlla tutti i dati`);
      return;
    }
    if (target.kind !== 'field') return;
    const { field } = target;
    const { label } = SCAN_FIELDS[field];
    if (!result.text) {
      toast.info(result.mode === 'date' ? `Nessuna data valida nella zona selezionata per “${label}”.` : 'Nessun testo riconosciuto nella zona selezionata.');
      return;
    }
    // Nel testo del referto si aggiunge in fondo (si può comporre da più zone); negli altri campi si sostituisce.
    form.setValue(field, field === 'body' && values.body ? `${values.body}\n\n${result.text}` : result.text);
    if (result.uncertain) toast.warning(`Testo inserito in “${label}”, ma la lettura è incerta: controllalo.`);
    else toast.success(`Testo inserito in “${label}”`);
  }
  // PDF caricato dal modal "Inserisci referto" con il form già aperto: si riempiono i campi ancora vuoti
  // (il tipo scelto dall'utente resta) e i valori letti si aggiungono a quelli già inseriti.
  const [pdfSnapshot, setPdfSnapshot] = useState<Values | null>(null);
  function receiveDraft(draft: ReportDraftDTO) {
    const next = draft.values;
    const merged: Values = { ...values, results: [...values.results, ...next.results] };
    for (const key of Object.keys(SCAN_FIELDS) as ScanField[]) if (!merged[key] && next[key]) merged[key] = next[key];
    form.reset(merged);
    nextKey.current = merged.results.length;
    setKeys(merged.results.map((_, i) => i));
    setUncertainKeys(new Set());
    setParser(draft.parser);
    // Dati letti in automatico: se si salva senza toccarli, si chiede conferma.
    if (draft.parser) setPdfSnapshot(merged);
  }

  // Il visualizzatore e il modal chiamano sempre la versione aggiornata (con i valori correnti del form).
  useEffect(() => {
    bridge?.setInbox({ scan: receiveScan, draft: receiveDraft });
    return () => bridge?.setInbox(null);
  });

  const dirty = JSON.stringify(values) !== JSON.stringify(initial);
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  // Referto letto da un PDF e salvato senza toccare nulla: prima di salvare si chiede conferma.
  const imported = mode.type === 'create' && !!mode.fileId;
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Inserimento a mano: il form si può compilare dalla risposta di un assistente IA (trascrizione di una foto).
  const [ai, setAi] = useState<{ values: Values; warnings: string[] } | null>(null);
  function importFromAi(next: Values, warnings: string[]) {
    // Le note personali già scritte restano.
    const merged = { ...next, notes: values.notes };
    form.reset(merged);
    nextKey.current = merged.results.length;
    setKeys(merged.results.map((_, i) => i));
    setAi({ values: merged, warnings });
    toast.success('Form compilato: controlla tutti i dati prima di salvare');
  }
  /** Dati letti in automatico (PDF o assistente IA) e non ancora toccati. */
  const untouchedSource = pdfSnapshot ?? (imported ? initial : ai?.values);

  function submit(e: FormEvent) {
    e.preventDefault();
    const data = form.validate();
    if (!data) {
      toast.error('Controlla i campi evidenziati');
      return;
    }
    if (uncertainKeys.size > 0 || (untouchedSource && JSON.stringify(values) === JSON.stringify(untouchedSource))) setConfirmOpen(true);
    else save(data);
  }

  function confirmSave() {
    setConfirmOpen(false);
    const data = form.validate();
    if (data) save(data);
  }

  function save(data: NonNullable<ReturnType<typeof form.validate>>) {
    // I valori contano solo per gli esami di laboratorio.
    const payload = { ...data, results: data.kind === 'LABORATORIO' ? data.results : [] };
    startTransition(async () => {
      // In caso di successo il server porta alla pagina del referto.
      const result =
        mode.type === 'create'
          ? await createReportAction(mode.patientId, payload, { fileId: mode.fileId, parser }, studyIds)
          : await updateReportAction(mode.reportId, payload, studyIds, parser);
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
    <>
    <form onSubmit={submit} noValidate className="grid gap-4">
      {scanNotes.length > 0 && (
        <Alert>
          <Info />
          <AlertTitle>Dalla lettura della pagina</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {scanNotes.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      {ai && (
        <Alert>
          <Info />
          <AlertTitle>Dati trascritti da un assistente IA</AlertTitle>
          <AlertDescription>
            <p>Possono contenere errori: confronta valori, unità e date con il referto originale prima di salvare.</p>
            {ai.warnings.length > 0 && (
              <ul className="mt-1 list-disc pl-4">
                {ai.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
          </AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Dati del referto</CardTitle>
          <CardDescription>
            {imported
              ? 'Controlla ciò che è stato letto dal PDF e correggi se serve.'
              : mode.type === 'create'
                ? 'Scrivili a mano, oppure falli trascrivere da una foto a un assistente IA.'
                : 'Correggi ciò che serve.'}
          </CardDescription>
          {mode.type === 'create' && !mode.fileId && (
            <CardAction>
              <AiImportDialog disabled={busy} onImport={importFromAi} />
            </CardAction>
          )}
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
              <WithScan field="examDate">
                <Input type="date" max={new Date().toISOString().slice(0, 10)} {...form.text('examDate')} />
              </WithScan>
            </FormField>
            <FormField
              label="Titolo"
              htmlFor="title"
              error={form.errors.title}
              description={isLab ? 'Ad esempio “Esami del sangue” o “Controllo tiroide”.' : 'Ad esempio “RM lombo-sacrale”.'}
              className="sm:col-span-2"
            >
              <WithScan field="title">
                <Input autoComplete="off" {...form.text('title')} />
              </WithScan>
            </FormField>
            <FormField label="Struttura" htmlFor="facility" error={form.errors.facility} description="Ospedale, laboratorio o studio.">
              <WithScan field="facility">
                <Input autoComplete="off" {...form.text('facility')} />
              </WithScan>
            </FormField>
            <FormField label="Numero del referto" htmlFor="reportNumber" error={form.errors.reportNumber}>
              <WithScan field="reportNumber">
                <Input autoComplete="off" {...form.text('reportNumber')} />
              </WithScan>
            </FormField>
            <FormField label="Medico" htmlFor="doctor" error={form.errors.doctor}>
              <WithScan field="doctor">
                <Input autoComplete="off" {...form.text('doctor')} />
              </WithScan>
            </FormField>
            <FormField label="Qualifica" htmlFor="doctorRole" error={form.errors.doctorRole}>
              <WithScan field="doctorRole">
                <Input autoComplete="off" placeholder="Es. Specialista radiologo" {...form.text('doctorRole')} />
              </WithScan>
            </FormField>
            {(isLab || form.values.samplingDate) && (
              <FormField
                label="Data del prelievo"
                htmlFor="samplingDate"
                error={form.errors.samplingDate}
                description="Il giorno in cui è stato fatto il prelievo, se indicato."
              >
                <WithScan field="samplingDate">
                  <Input type="date" max={new Date().toISOString().slice(0, 10)} {...form.text('samplingDate')} />
                </WithScan>
              </FormField>
            )}
            <FormField label="Data del referto" htmlFor="reportDate" error={form.errors.reportDate} description="Se diversa da quella dell’esame.">
              <WithScan field="reportDate">
                <Input type="date" max={new Date().toISOString().slice(0, 10)} {...form.text('reportDate')} />
              </WithScan>
            </FormField>
          </FieldGroup>
        </CardContent>
      </Card>

      {isLab && (
        <Card>
          <CardHeader>
            <CardTitle>Valori</CardTitle>
            <CardDescription className="grid gap-1">
              <span>
                {values.results.length
                  ? `${values.results.length} valori. “Fuori” si calcola da solo dall’intervallo: puoi comunque cambiarlo.`
                  : 'Nessun valore: aggiungili a mano.'}
              </span>
              <span>
                “Gruppo” è il titolo del blocco nel referto (Emocromo, Chimica clinica…) ed è facoltativo. Per le analisi delle urine scrivi “Esame
                urine”: così restano separate da quelle del sangue nell’andamento.
              </span>
            </CardDescription>
            <CardAction className="flex flex-wrap justify-end gap-1.5">
              <ScanButton target={{ kind: 'table' }} label="Leggi i valori da una zona della scansione">
                Dalla scansione
              </ScanButton>
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
                      <th className="w-[16%] pb-1 font-medium" title="Titolo del blocco nel referto, es. Emocromo o Esame urine (facoltativo)">
                        Gruppo
                      </th>
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
                            placeholder={field === 'section' ? 'facoltativo' : undefined}
                            value={r[field]}
                            onChange={(e) =>
                              // Se cambiano valore o intervallo, il "fuori range" torna automatico.
                              updateRow(i, field === 'value' || field === 'referenceRange' ? { [field]: e.target.value, outOfRange: null } : { [field]: e.target.value })
                            }
                          />
                        </td>
                      );
                      const doubtful = uncertainKeys.has(keys[i]!);
                      return (
                        <tr
                          key={keys[i]}
                          title={doubtful ? 'Letto dalla scansione con poca sicurezza: controllalo con il documento' : undefined}
                          className={cn(out && '[&_input]:bg-destructive/5', doubtful && '[&_input]:border-amber-500 [&_input]:bg-amber-500/10')}
                        >
                          {cell('section', 'Gruppo')}
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
            <WithScan field="body">
              <Textarea rows={isLab ? 3 : 12} className="leading-relaxed" {...form.text('body')} />
            </WithScan>
          </FormField>
        </CardContent>
      </Card>

      <ReportImagesField imaging={imaging} selected={studyIds} onChange={setStudyIds} disabled={busy} studyDate={values.examDate} startEmpty={mode.type === 'create'} />

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
        {mode.type === 'create' && mode.onCancel ? (
          <Button type="button" variant="outline" disabled={busy} onClick={mode.onCancel}>
            Annulla
          </Button>
        ) : mode.type === 'create' && mode.fileId ? (
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
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Hai controllato i dati?</AlertDialogTitle>
          <AlertDialogDescription>
            {uncertainKeys.size > 0
              ? `${uncertainKeys.size === 1 ? 'Un valore letto' : `${uncertainKeys.size} valori letti`} dalla scansione con poca sicurezza (evidenziati) non ${uncertainKeys.size === 1 ? 'è stato modificato' : 'sono stati modificati'}. Prima di salvare, confrontali con il documento.`
              : `${imported ? 'La lettura automatica del PDF' : 'La trascrizione dell’assistente IA'} può contenere errori e non hai modificato nulla. Prima di salvare, assicurati che${isLab ? ' valori, unità e intervalli di riferimento' : ' i dati e il testo'} corrispondano al referto originale.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Ricontrollo</AlertDialogCancel>
          <AlertDialogAction onClick={confirmSave}>{isLab ? 'Valori confermati' : 'Dati confermati'}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
