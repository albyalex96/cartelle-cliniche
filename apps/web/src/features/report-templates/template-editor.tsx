'use client';

import {
  isStandardReportField,
  REPORT_FIELD_TYPE_LABELS,
  REPORT_FIELD_TYPES,
  reportFieldOcrMode,
  reportTemplateInputSchema,
  STANDARD_REPORT_FIELD_KEYS,
  STANDARD_REPORT_FIELDS,
  type ReportCategory,
  type ReportField,
  type ReportFieldType,
  type ReportTemplateDTO,
} from '@alby/shared';
import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useTransition, type FormEvent } from 'react';
import { toast } from 'sonner';
import type { z } from 'zod';
import { FormField } from '@/components/form-field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FieldGroup } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useZodForm } from '@/lib/use-zod-form';
import { saveReportTemplateAction } from '@/server/actions/report-templates';

const LIST = '/admin/tipi-referto';
/** Voce "nessuna categoria" (il componente Select non accetta un valore vuoto). */
const NO_CATEGORY = '__nessuna__';

/** Tipi tra cui scegliere per un campo personalizzato (la tabella dei valori è solo un campo standard). */
const CUSTOM_TYPES = REPORT_FIELD_TYPES.filter((t) => t !== 'lab_table');

interface Values extends Record<string, unknown> {
  name: string;
  description: string;
  fields: ReportField[];
  categories: ReportCategory[];
}

const newKey = (prefix = 'c') => `${prefix}_${Math.random().toString(36).slice(2, 10).padEnd(8, '0')}`;

/**
 * Editor di un tipo di referto: nome e elenco dei campi (aggiungi, riordina, elimina; per ognuno tipo,
 * etichetta, obbligatorio, lettura dalla scansione). Ciò che si salva è l'elenco
 * `{ key, type, label, required, ocr_enabled, hint, options, category }`, più le categorie `{ key, name, description }`.
 */
export function TemplateEditor({
  template,
  copyOf,
}: {
  /** Tipo da modificare; `null` per crearne uno nuovo. */
  template: ReportTemplateDTO | null;
  /** Nuovo tipo che parte come copia di uno esistente. */
  copyOf?: ReportTemplateDTO | null;
}) {
  const start = template ?? copyOf;
  const form = useZodForm<Values, unknown>(reportTemplateInputSchema as z.ZodType<unknown, Values>, {
    name: template?.name ?? (copyOf ? `${copyOf.name} (copia)` : ''),
    description: start?.description ?? '',
    fields: start?.fields ?? [],
    categories: start?.categories ?? [],
  });
  const [pending, startTransition] = useTransition();
  const { fields, categories } = form.values;
  const error = (i: number, name: keyof ReportField) => form.errors[`fields.${i}.${name}`];

  const setFields = (next: ReportField[]) => {
    form.setValue('fields', next);
    // Gli errori sono legati alla posizione dei campi: cambiando l'elenco non valgono più.
    form.setErrors({});
  };
  const patch = (i: number, change: Partial<ReportField>) => form.setValue('fields', fields.map((f, j) => (j === i ? { ...f, ...change } : f)));
  const move = (i: number, by: -1 | 1) => {
    const next = [...fields];
    [next[i], next[i + by]] = [next[i + by]!, next[i]!];
    setFields(next);
  };
  const addCustom = () => setFields([...fields, { key: newKey(), type: 'text_input', label: '', required: false, ocr_enabled: true, hint: '', options: [], category: '' }]);
  const addStandard = (key: (typeof STANDARD_REPORT_FIELD_KEYS)[number]) => {
    const { type, label, hint } = STANDARD_REPORT_FIELDS[key];
    setFields([...fields, { key, type, label, required: false, ocr_enabled: true, hint, options: [], category: '' }]);
  };
  /** Copia del campo subito sotto, come campo personalizzato (un campo standard c'è una volta sola). */
  const duplicate = (i: number) => {
    const f = fields[i]!;
    setFields([...fields.slice(0, i + 1), { ...f, key: newKey(), label: `${f.label} (copia)`, options: [...f.options] }, ...fields.slice(i + 1)]);
  };

  const categoryError = (i: number, name: keyof ReportCategory) => form.errors[`categories.${i}.${name}`];
  const setCategories = (next: ReportCategory[]) => {
    form.setValue('categories', next);
    form.setErrors({});
  };
  const patchCategory = (i: number, change: Partial<ReportCategory>) =>
    form.setValue('categories', categories.map((c, j) => (j === i ? { ...c, ...change } : c)));
  const moveCategory = (i: number, by: -1 | 1) => {
    const next = [...categories];
    [next[i], next[i + by]] = [next[i + by]!, next[i]!];
    setCategories(next);
  };
  /** Togliendo una categoria, i suoi campi restano senza categoria. */
  const removeCategory = (i: number) => {
    const key = categories[i]!.key;
    form.setValue('fields', fields.map((f) => (f.category === key ? { ...f, category: '' } : f)));
    setCategories(categories.filter((_, j) => j !== i));
  };
  const unusedStandard =STANDARD_REPORT_FIELD_KEYS.filter((k) => !fields.some((f) => f.key === k));

  function submit(e: FormEvent) {
    e.preventDefault();
    // Le righe vuote dell'elenco di voci (mentre si scrive) non contano.
    const clean = { ...form.values, fields: fields.map((f) => ({ ...f, options: f.options.map((o) => o.trim()).filter(Boolean) })) };
    const parsed = reportTemplateInputSchema.safeParse(clean);
    if (!parsed.success) {
      form.validate();
      toast.error('Controlla i campi evidenziati');
      return;
    }
    startTransition(async () => {
      // In caso di successo il server torna all'elenco dei tipi.
      const result = await saveReportTemplateAction(template?.id ?? null, parsed.data);
      if (!result.ok && !form.applyResult(result)) toast.error(result.message);
    });
  }

  return (
    <form onSubmit={submit} noValidate className="grid max-w-3xl gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Tipo di referto</CardTitle>
          {template && <CardDescription>Le modifiche valgono per i referti inseriti o modificati da ora: quelli già salvati conservano i loro campi.</CardDescription>}
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <FormField label="Nome" htmlFor="name" error={form.errors.name} description="Ad esempio “Visita cardiologica” o “Lettera di dimissione”.">
              <Input autoComplete="off" autoFocus={!template} {...form.text('name')} />
            </FormField>
            <FormField label="Descrizione" htmlFor="description" error={form.errors.description} description="Facoltativa: compare accanto al nome quando si sceglie il tipo.">
              <Input autoComplete="off" {...form.text('description')} />
            </FormField>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Categorie</CardTitle>
          <CardDescription>
            Facoltative: nella pagina del referto i campi della stessa categoria compaiono insieme, in un riquadro con il nome della categoria, nell’ordine
            indicato qui. I campi senza categoria restano come sono.
          </CardDescription>
          <CardAction>
            <Button type="button" variant="outline" size="sm" onClick={() => setCategories([...categories, { key: newKey('k'), name: '', description: '' }])}>
              <Plus />
              Aggiungi categoria
            </Button>
          </CardAction>
        </CardHeader>
        {categories.length > 0 && (
          <CardContent className="grid gap-3">
            {categories.map((c, i) => {
              const position = `categoria ${i + 1}`;
              return (
                <div key={c.key} className="grid gap-2 rounded-lg border p-3">
                  <div className="flex flex-wrap items-start gap-2">
                    <div className="grid min-w-48 flex-1 gap-1">
                      <Input
                        aria-label={`Nome, ${position}`}
                        placeholder="Nome della categoria"
                        autoComplete="off"
                        value={c.name}
                        aria-invalid={categoryError(i, 'name') ? true : undefined}
                        onChange={(e) => patchCategory(i, { name: e.target.value })}
                      />
                      {categoryError(i, 'name') && <p className="text-sm text-destructive">{categoryError(i, 'name')}</p>}
                    </div>
                    <div className="flex gap-0.5">
                      <Button type="button" variant="ghost" size="icon" aria-label={`Sposta su, ${position}`} disabled={i === 0} onClick={() => moveCategory(i, -1)}>
                        <ArrowUp />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Sposta giù, ${position}`}
                        disabled={i === categories.length - 1}
                        onClick={() => moveCategory(i, 1)}
                      >
                        <ArrowDown />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Elimina, ${position}`}
                        title="Elimina (i suoi campi restano, senza categoria)"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => removeCategory(i)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                  <Input
                    aria-label={`Descrizione, ${position}`}
                    placeholder="Descrizione (facoltativa)"
                    autoComplete="off"
                    value={c.description}
                    aria-invalid={categoryError(i, 'description') ? true : undefined}
                    onChange={(e) => patchCategory(i, { description: e.target.value })}
                  />
                </div>
              );
            })}
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Campi</CardTitle>
          <CardDescription className="grid gap-1">
            <span>Titolo, data dell’esame, immagini e note personali ci sono in ogni referto: qui scegli gli altri campi.</span>
            <span>
              I campi brevi compaiono insieme in alto, nell’ordine indicato; testi lunghi e tabella dei valori hanno ciascuno un riquadro, più sotto. I
              campi standard vengono compilati anche dalla lettura automatica dei PDF.
            </span>
          </CardDescription>
          <CardAction>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="sm">
                  <Plus />
                  Aggiungi campo
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={addCustom}>Campo personalizzato</DropdownMenuItem>
                {unusedStandard.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Campi standard</DropdownMenuLabel>
                    {unusedStandard.map((key) => (
                      <DropdownMenuItem key={key} onSelect={() => addStandard(key)}>
                        {STANDARD_REPORT_FIELDS[key].label}
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-3">
          {fields.length === 0 && <p className="text-sm text-muted-foreground">Nessun campo: il referto avrà solo titolo, data dell’esame, immagini e note.</p>}
          {form.errors.fields && <p className="text-sm text-destructive">{form.errors.fields}</p>}
          {fields.map((f, i) => {
            const standard = isStandardReportField(f.key);
            const position = `campo ${i + 1}`;
            return (
              <div key={f.key} className="grid gap-3 rounded-lg border p-3">
                <div className="flex flex-wrap items-start gap-2">
                  <div className="grid min-w-48 flex-1 gap-1">
                    <Input
                      aria-label={`Etichetta, ${position}`}
                      placeholder="Etichetta del campo"
                      autoComplete="off"
                      value={f.label}
                      aria-invalid={error(i, 'label') ? true : undefined}
                      onChange={(e) => patch(i, { label: e.target.value })}
                    />
                    {error(i, 'label') && <p className="text-sm text-destructive">{error(i, 'label')}</p>}
                  </div>
                  {standard ? (
                    <Badge variant="secondary" className="h-9 px-3" title="Campo standard: il tipo è fisso">
                      {REPORT_FIELD_TYPE_LABELS[f.type]} · standard
                    </Badge>
                  ) : (
                    <Select value={f.type} onValueChange={(v) => patch(i, { type: v as ReportFieldType })}>
                      <SelectTrigger className="w-48" aria-label={`Tipo, ${position}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CUSTOM_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {REPORT_FIELD_TYPE_LABELS[t]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <div className="flex gap-0.5">
                    <Button type="button" variant="ghost" size="icon" aria-label={`Sposta su, ${position}`} disabled={i === 0} onClick={() => move(i, -1)}>
                      <ArrowUp />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" aria-label={`Sposta giù, ${position}`} disabled={i === fields.length - 1} onClick={() => move(i, 1)}>
                      <ArrowDown />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Duplica, ${position}`}
                      title={f.type === 'lab_table' ? 'La tabella dei valori c’è una sola volta' : 'Duplica'}
                      disabled={f.type === 'lab_table'}
                      onClick={() => duplicate(i)}
                    >
                      <Copy />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Elimina, ${position}`}
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => setFields(fields.filter((_, j) => j !== i))}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
                {(error(i, 'type') || error(i, 'key')) && <p className="text-sm text-destructive">{error(i, 'type') ?? error(i, 'key')}</p>}

                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                  {categories.length > 0 && (
                    <Select value={f.category || NO_CATEGORY} onValueChange={(v) => patch(i, { category: v === NO_CATEGORY ? '' : v })}>
                      <SelectTrigger size="sm" className="w-48" aria-label={`Categoria, ${position}`} aria-invalid={error(i, 'category') ? true : undefined}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_CATEGORY}>Nessuna categoria</SelectItem>
                        {categories.map((c) => (
                          <SelectItem key={c.key} value={c.key}>
                            {c.name || 'Categoria senza nome'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <label className="flex items-center gap-2">
                    <Switch checked={f.required} onCheckedChange={(checked) => patch(i, { required: checked })} />
                    Obbligatorio
                  </label>
                  {reportFieldOcrMode(f.type) && (
                    <label className="flex items-center gap-2">
                      <Switch checked={f.ocr_enabled} onCheckedChange={(checked) => patch(i, { ocr_enabled: checked })} />
                      Si può leggere dalla scansione (OCR)
                    </label>
                  )}
                </div>

                {f.type === 'select' && (
                  <div className="grid gap-1">
                    <Textarea
                      aria-label={`Voci dell’elenco, ${position}`}
                      rows={3}
                      placeholder={'Voci tra cui scegliere, una per riga'}
                      value={f.options.join('\n')}
                      aria-invalid={error(i, 'options') ? true : undefined}
                      onChange={(e) => patch(i, { options: e.target.value.split('\n') })}
                    />
                    {error(i, 'options') && <p className="text-sm text-destructive">{error(i, 'options')}</p>}
                  </div>
                )}

                <Input
                  aria-label={`Spiegazione, ${position}`}
                  placeholder="Spiegazione mostrata sotto il campo (facoltativa)"
                  autoComplete="off"
                  value={f.hint}
                  aria-invalid={error(i, 'hint') ? true : undefined}
                  onChange={(e) => patch(i, { hint: e.target.value })}
                />
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="sticky bottom-0 z-10 -mx-1 flex justify-end gap-2 border-t bg-background/90 px-1 py-3 backdrop-blur">
        <Button type="button" variant="outline" disabled={pending} asChild>
          <Link href={LIST}>Annulla</Link>
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Spinner />}
          {template ? 'Salva modifiche' : 'Crea tipo di referto'}
        </Button>
      </div>
    </form>
  );
}
