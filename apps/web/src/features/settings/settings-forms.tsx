'use client';

import {
  auditSettingsSchema,
  catalogSettingKeys,
  drugsUpdateSettingsSchema,
  servicesUpdateSettingsSchema,
  sessionSettingsSchema,
  type AutoUpdateCatalog,
} from '@alby/shared';
import { useTransition, type FormEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import type { z } from 'zod';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { useZodForm } from '@/lib/use-zod-form';
import { updateSettingsAction } from '@/server/actions/settings';

interface NumberField {
  key: string;
  label: string;
  /** Unità scritta accanto al campo ("giorni", "mesi"). */
  unit: string;
  description: ReactNode;
  min: number;
  max: number;
}

/** Form di un gruppo di impostazioni numeriche: salva solo le voci di questo gruppo. */
function NumberSettingsForm({
  schema,
  initial,
  fields,
}: {
  schema: z.ZodType<Record<string, number>, Record<string, unknown>>;
  initial: Record<string, number>;
  fields: NumberField[];
}) {
  const form = useZodForm(schema, Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, String(v)])));
  const [pending, startTransition] = useTransition();
  const unchanged = fields.every((f) => String(form.values[f.key]).trim() === String(initial[f.key]));

  function submit(e: FormEvent) {
    e.preventDefault();
    const data = form.validate();
    if (!data) return;
    startTransition(async () => {
      const result = await updateSettingsAction(data);
      if (result.ok) toast.success('Impostazioni salvate');
      else if (!form.applyResult(result)) toast.error(result.message);
    });
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-5">
      {fields.map((f) => (
        <FormField key={f.key} label={f.label} htmlFor={f.key} error={form.errors[f.key]} description={f.description}>
          <div className="flex items-center gap-2">
            <Input type="number" inputMode="numeric" min={f.min} max={f.max} step={1} className="w-28" {...form.text(f.key)} />
            <span className="text-sm text-muted-foreground">{f.unit}</span>
          </div>
        </FormField>
      ))}
      <div>
        <Button type="submit" disabled={pending || unchanged}>
          {pending && <Spinner />}
          Salva
        </Button>
      </div>
    </form>
  );
}

export function SessionSettingsForm({
  values,
  defaults,
}: {
  values: { sessionIdleDays: number; sessionMaxDays: number };
  defaults: { sessionIdleDays: number; sessionMaxDays: number };
}) {
  return (
    <NumberSettingsForm
      schema={sessionSettingsSchema}
      initial={values}
      fields={[
        {
          key: 'sessionIdleDays',
          label: 'Scadenza per inattività',
          unit: 'giorni',
          min: 1,
          max: 365,
          description: `Chi non usa l’archivio per questo tempo deve rientrare con la password. Predefinito: ${defaults.sessionIdleDays}.`,
        },
        {
          key: 'sessionMaxDays',
          label: 'Durata massima',
          unit: 'giorni',
          min: 1,
          max: 730,
          description: `Passato questo tempo dall’accesso bisogna rientrare comunque, anche usando l’archivio ogni giorno. Predefinito: ${defaults.sessionMaxDays}.`,
        },
      ]}
    />
  );
}

export function AuditSettingsForm({ values }: { values: { auditRetentionMonths: number } }) {
  return (
    <NumberSettingsForm
      schema={auditSettingsSchema}
      initial={values}
      fields={[
        {
          key: 'auditRetentionMonths',
          label: 'Conserva le voci per',
          unit: 'mesi',
          min: 0,
          max: 120,
          description: 'Le voci più vecchie vengono eliminate da sole, una volta al giorno. Con 0 l’audit log si conserva per sempre.',
        },
      ]}
    />
  );
}

const UPDATE_SCHEMAS = { drugs: drugsUpdateSettingsSchema, services: servicesUpdateSettingsSchema } as const;
const HOURS = Array.from({ length: 24 }, (_, h) => String(h));

/** Aggiornamento automatico di un elenco pubblico: attivo o no, ogni quanti giorni e a che ora. */
export function CatalogUpdateForm({ catalog, values }: { catalog: AutoUpdateCatalog; values: { enabled: boolean; days: number; hour: number } }) {
  const keys = catalogSettingKeys(catalog);
  const form = useZodForm(UPDATE_SCHEMAS[catalog] as z.ZodType<Record<string, unknown>, Record<string, unknown>>, {
    [keys.enabled]: values.enabled,
    [keys.days]: String(values.days),
    [keys.hour]: String(values.hour),
  });
  const [pending, startTransition] = useTransition();
  const enabled = form.values[keys.enabled] === true;
  const unchanged =
    enabled === values.enabled && String(form.values[keys.days]).trim() === String(values.days) && form.values[keys.hour] === String(values.hour);

  function submit(e: FormEvent) {
    e.preventDefault();
    const data = form.validate();
    if (!data) return;
    startTransition(async () => {
      const result = await updateSettingsAction(data);
      if (result.ok) toast.success(enabled ? 'Aggiornamento automatico programmato' : 'Aggiornamento automatico disattivato');
      else if (!form.applyResult(result)) toast.error(result.message);
    });
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-5">
      <div className="flex items-center gap-3">
        <Switch id={keys.enabled} checked={enabled} onCheckedChange={(v) => form.setValue(keys.enabled, v)} />
        <Label htmlFor={keys.enabled}>Aggiornamento automatico</Label>
      </div>
      <div className="flex flex-wrap gap-x-8 gap-y-5">
        <FormField label="Ogni" htmlFor={keys.days} error={form.errors[keys.days]} className="w-auto">
          <div className="flex items-center gap-2">
            <Input type="number" inputMode="numeric" min={1} max={365} step={1} className="w-24" disabled={!enabled} {...form.text(keys.days)} />
            <span className="text-sm text-muted-foreground">giorni</span>
          </div>
        </FormField>
        <FormField label="Alle ore" htmlFor={keys.hour} error={form.errors[keys.hour]} className="w-auto">
          <Select value={String(form.values[keys.hour])} onValueChange={(v) => form.setValue(keys.hour, v)} disabled={!enabled}>
            <SelectTrigger id={keys.hour} className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HOURS.map((h) => (
                <SelectItem key={h} value={h}>
                  {h.padStart(2, '0')}:00
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      </div>
      <div>
        <Button type="submit" disabled={pending || unchanged}>
          {pending && <Spinner />}
          Salva
        </Button>
      </div>
    </form>
  );
}
