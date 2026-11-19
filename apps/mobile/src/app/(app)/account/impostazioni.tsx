import {
  reportDateFields,
  type AutoUpdateCatalog,
  type CatalogAutoUpdateDTO,
  type MaintenanceResultDTO,
  type ServerSettings,
  type ServerSettingsDTO,
} from '@alby/shared';
import { Stack } from 'expo-router';
import { Download, Eraser, LogOut, Save } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { ApiError } from '@/lib/api';
import { listLocalTemplates } from '@/lib/local-data';
import { onlineErrorMessage, useApi, useOnline } from '@/lib/online';
import { useSync } from '@/lib/sync-context';
import { useLocal } from '@/lib/use-local';
import { Card, Detail, OnlineView } from '@/ui/blocks';
import { Button, Chips, ErrorBox, Field } from '@/ui/controls';
import { useBottomSpace } from '@/ui/tab-bar';
import { spacing, useTheme } from '@/ui/theme';

type SettingsResponse = ServerSettingsDTO & {
  activeSessions: number;
  auditEntries: number;
  catalogs: Record<AutoUpdateCatalog, CatalogAutoUpdateDTO>;
};

type NumberKey = { [K in keyof ServerSettings]: ServerSettings[K] extends number ? K : never }[keyof ServerSettings];

const dateTime = new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: 'short' });
const when = (iso: string | null) => (iso ? dateTime.format(new Date(iso)) : 'Mai');

const CATALOGS: { key: AutoUpdateCatalog; title: string; path: string; prefix: 'drugs' | 'services' }[] = [
  { key: 'drugs', title: 'Elenco farmaci (AIFA)', path: '/admin/catalogs/drugs', prefix: 'drugs' },
  { key: 'services', title: 'Prestazioni (Regione Puglia)', path: '/admin/catalogs/services', prefix: 'services' },
];

/** Impostazioni del server (solo amministratori, online): sessioni, registro, piano terapeutico, elenchi pubblici. */
export default function SettingsScreen() {
  const t = useTheme();
  const { state, reload } = useOnline<SettingsResponse>('/admin/settings');
  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <Stack.Screen options={{ title: 'Impostazioni' }} />
      <OnlineView state={state} reload={reload}>
        {(data) => <SettingsForm data={data} reload={reload} />}
      </OnlineView>
    </View>
  );
}

function SettingsForm({ data, reload }: { data: SettingsResponse; reload(): void }) {
  const t = useTheme();
  const bottom = useBottomSpace();
  const { send } = useApi();
  const { syncNow } = useSync();
  const templates = useLocal(listLocalTemplates, []);
  const [values, setValues] = useState<ServerSettings>(data.values);
  // I numeri si scrivono come testo e si convertono al salvataggio.
  const [numbers, setNumbers] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(data.values).filter(([, v]) => typeof v === 'number').map(([k, v]) => [k, String(v)])),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const number = (key: NumberKey, label: string) => (
    <Field
      label={`${label} (predefinito ${data.defaults[key]})`}
      value={numbers[key] ?? ''}
      onChangeText={(v) => setNumbers((n) => ({ ...n, [key]: v }))}
      keyboardType="number-pad"
      error={errors[key]}
    />
  );
  const toggle = (key: 'drugsAutoUpdate' | 'servicesAutoUpdate', label: string) => (
    <View style={styles.switchRow}>
      <Text style={[styles.label, { color: t.text }]}>{label}</Text>
      <Switch accessibilityLabel={label} value={values[key]} onValueChange={(v) => setValues((s) => ({ ...s, [key]: v }))} />
    </View>
  );

  async function save() {
    setSaving(true);
    setError(null);
    const body: Record<string, unknown> = { ...values };
    for (const [k, v] of Object.entries(numbers)) body[k] = v.trim() === '' ? NaN : Number(v);
    try {
      await send('PATCH', '/admin/settings', { body });
      setErrors({});
      Alert.alert('Impostazioni salvate');
      reload();
    } catch (err) {
      setErrors(err instanceof ApiError && err.fields ? err.fields : {});
      setError(onlineErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  /** Azione immediata, con conferma facoltativa. */
  async function run(key: string, task: () => Promise<string>) {
    setBusy(key);
    try {
      Alert.alert('Fatto', await task());
      reload();
    } catch (err) {
      Alert.alert('Operazione non riuscita', onlineErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  const plan = templates.status === 'ready' ? templates.data.find((tpl) => tpl.id === values.therapyPlanTemplateId) : undefined;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottom }]} keyboardShouldPersistTaps="handled">
        <Card title="Sessioni" subtitle="Per quanto tempo si resta collegati. Vale per tutti, dalla prossima attività.">
          {number('sessionIdleDays', 'Scade dopo giorni di inattività')}
          {number('sessionMaxDays', 'Durata massima in giorni')}
          <Detail label="Sessioni aperte" value={String(data.activeSessions)} />
          <Button
            title="Chiudi le sessioni degli altri"
            icon={LogOut}
            variant="secondary"
            busy={busy === 'sessions'}
            onPress={() =>
              Alert.alert('Chiudere tutte le sessioni?', 'Tutti gli altri utenti dovranno accedere di nuovo (la tua resta aperta).', [
                { text: 'Annulla', style: 'cancel' },
                {
                  text: 'Chiudi',
                  style: 'destructive',
                  onPress: () =>
                    void run('sessions', async () => {
                      const res = await send<{ sessions: number }>('DELETE', '/admin/sessions');
                      return res.sessions === 1 ? '1 sessione chiusa.' : `${res.sessions} sessioni chiuse.`;
                    }),
                },
              ])
            }
          />
        </Card>

        <Card title="Registro accessi" subtitle="0 = conserva per sempre.">
          {number('auditRetentionMonths', 'Mesi di conservazione')}
          <Detail label="Voci nel registro" value={data.auditEntries.toLocaleString('it-IT')} />
          <Button
            title="Pulizia ora"
            icon={Eraser}
            variant="secondary"
            busy={busy === 'maintenance'}
            onPress={() =>
              void run('maintenance', async () => {
                const res = await send<MaintenanceResultDTO>('POST', '/admin/maintenance');
                return `${res.expiredSessions} sessioni scadute e ${res.auditEntries} voci vecchie del registro eliminate.`;
              })
            }
          />
        </Card>

        <Card title="Piano terapeutico" subtitle="Tipo di referto e data di scadenza mostrati nella panoramica del paziente.">
          {templates.status === 'ready' ? (
            <Chips
              options={templates.data.map((tpl) => ({ value: tpl.id, label: tpl.name }))}
              value={values.therapyPlanTemplateId ?? ''}
              onChange={(id) => setValues((s) => ({ ...s, therapyPlanTemplateId: id || null, therapyPlanDateField: null }))}
              clearable
            />
          ) : null}
          {plan ? (
            <Chips
              options={reportDateFields(plan.fields).map((f) => ({ value: f.key, label: f.label }))}
              value={values.therapyPlanDateField ?? ''}
              onChange={(key) => setValues((s) => ({ ...s, therapyPlanDateField: key || null }))}
              clearable
            />
          ) : null}
        </Card>

        {CATALOGS.map((c) => {
          const status = data.catalogs[c.key];
          return (
            <Card key={c.key} title={c.title}>
              <Detail label="Ultimo aggiornamento" value={when(status.importedAt)} />
              <Detail label="Prossimo aggiornamento" value={status.nextRunAt ? when(status.nextRunAt) : null} />
              <Detail label="Ultimo errore" value={status.lastError} />
              {toggle(`${c.prefix}AutoUpdate`, 'Aggiornamento automatico')}
              {number(`${c.prefix}UpdateDays`, 'Ogni quanti giorni')}
              {number(`${c.prefix}UpdateHour`, 'A che ora (0–23)')}
              <Button
                title="Aggiorna ora"
                icon={Download}
                variant="secondary"
                busy={busy === c.key || status.running}
                onPress={() =>
                  void run(c.key, async () => {
                    // Scaricare l'elenco richiede anche qualche minuto.
                    await send('POST', c.path, { timeoutMs: 600_000 });
                    void syncNow();
                    return 'Elenco aggiornato.';
                  })
                }
              />
            </Card>
          );
        })}

        <ErrorBox message={error} />
        <Button title="Salva le impostazioni" icon={Save} busy={saving} onPress={() => void save()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.md },
  label: { fontSize: 15, fontWeight: '600', flex: 1 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
