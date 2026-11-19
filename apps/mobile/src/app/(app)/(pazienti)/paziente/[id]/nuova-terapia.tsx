import { medicationInputSchema, type DrugCatalogPageDTO, type DrugDetailDTO, type DrugSuggestionDTO, type MedicationDTO } from '@alby/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Pill, Save, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { ApiError } from '@/lib/api';
import { getLocalMedication, getLocalPatient } from '@/lib/local-data';
import { useApi, useOnline } from '@/lib/online';
import { useSync } from '@/lib/sync-context';
import { useLocal } from '@/lib/use-local';
import { LocalView, Message, Row } from '@/ui/blocks';
import { Button, Chips, DateField, ErrorBox, Field } from '@/ui/controls';
import { useBottomSpace } from '@/ui/tab-bar';
import { spacing, useTheme } from '@/ui/theme';

const FREQUENCIES = ['1 volta al giorno', '2 volte al giorno', '3 volte al giorno', 'al mattino', 'alla sera', 'mattina e sera'];
const MAX_SUGGESTIONS = 5;

const emptyValues = () => ({
  name: '',
  activeIngredient: '',
  aic: '',
  strength: '',
  form: '',
  dosage: '',
  frequency: '',
  asNeeded: false,
  reason: '',
  prescriber: '',
  startDate: new Date().toISOString().slice(0, 10),
  endDate: '',
  notes: '',
});

type Values = ReturnType<typeof emptyValues>;

/** Valori di una terapia esistente, per modificarla (i campi vuoti arrivano come null). */
const valuesOf = (m: MedicationDTO): Values => {
  const base = emptyValues();
  const out = { ...base, asNeeded: m.asNeeded } as Values;
  for (const key of Object.keys(base) as (keyof Values)[]) {
    if (key !== 'asNeeded') out[key] = (m[key] as string | null) ?? '';
  }
  return out;
};
type TextKey = Exclude<keyof Values, 'asNeeded'>;

const toOptions = (list: (string | null)[]) => [...new Set(list.filter((v): v is string => !!v))].map((v) => ({ value: v, label: v }));

/**
 * Nuova terapia, o modifica di una esistente (`medicationId`): il farmaco si cerca nell'elenco AIFA o si scrive
 * a mano. Per salvare serve la connessione.
 */
export default function NewMedicationScreen() {
  const t = useTheme();
  const { id, medicationId } = useLocalSearchParams<{ id: string; medicationId?: string }>();
  const result = useLocal(async () => {
    const patient = await getLocalPatient(id);
    const medication = medicationId ? await getLocalMedication(medicationId) : null;
    return patient && (!medicationId || medication) ? { patient, medication } : null;
  }, [id, medicationId]);
  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <Stack.Screen options={{ title: medicationId ? 'Modifica terapia' : 'Nuova terapia' }} />
      <LocalView result={result} empty="Terapia non disponibile: forse è stata eliminata o l’accesso è stato revocato.">
        {({ patient, medication }) =>
          patient.canEdit ? (
            <MedicationForm patientId={id} medication={medication} />
          ) : (
            <Message>Non hai il permesso di modificare le terapie di questo paziente.</Message>
          )
        }
      </LocalView>
    </View>
  );
}

/** Farmaci dell'elenco AIFA simili al nome scritto; senza connessione semplicemente non ne compaiono. */
function useDrugSuggestions(name: string, enabled: boolean) {
  const { get } = useApi();
  const [items, setItems] = useState<DrugSuggestionDTO[]>([]);
  const query = enabled ? name.trim() : '';
  useEffect(() => {
    setItems([]);
    if (query.length < 2) return;
    let current = true;
    const timer = setTimeout(() => {
      get<DrugCatalogPageDTO>(`/drugs?${new URLSearchParams({ q: query })}`)
        .then((res) => current && setItems(res.items.slice(0, MAX_SUGGESTIONS)))
        .catch(() => {});
    }, 300);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [get, query]);
  return items;
}

function MedicationForm({ patientId, medication }: { patientId: string; medication: MedicationDTO | null }) {
  const t = useTheme();
  const bottom = useBottomSpace();
  const { send } = useApi();
  const { syncNow } = useSync();
  const [values, setValues] = useState<Values>(() => (medication ? valuesOf(medication) : emptyValues()));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const suggestions = useDrugSuggestions(values.name, !values.aic);
  const drug = useOnline<DrugDetailDTO>(values.aic ? `/drugs/${encodeURIComponent(values.aic)}` : null);
  const variants = values.aic && drug.state.status === 'ready' ? drug.state.data.variants : [];
  // I due elenchi si filtrano a vicenda, come nella webapp.
  const formOptions = toOptions(variants.filter((v) => !values.strength || v.strength === values.strength || !variants.some((o) => o.strength === values.strength)).map((v) => v.form));
  const strengthOptions = toOptions(variants.filter((v) => !values.form || v.form === values.form || !variants.some((o) => o.form === values.form)).map((v) => v.strength));

  const set = (key: TextKey) => (value: string) => setValues((v) => ({ ...v, [key]: value }));
  const text = (key: TextKey) => ({ value: values[key], onChangeText: set(key), error: errors[key] });

  function pick(d: DrugSuggestionDTO) {
    // Un altro farmaco: formulazione e dosaggio di prima non valgono più.
    setValues((v) => ({ ...v, name: d.name, aic: d.aic, activeIngredient: d.activeIngredient ?? v.activeIngredient, form: '', strength: '' }));
  }

  async function save() {
    const parsed = medicationInputSchema.safeParse(values);
    const found: Record<string, string> = {};
    if (!parsed.success) for (const issue of parsed.error.issues) found[issue.path.join('.')] ??= issue.message;
    setErrors(found);
    if (!parsed.success) {
      setError('Controlla i campi evidenziati.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (medication) {
        await send<MedicationDTO>('PUT', `/medications/${encodeURIComponent(medication.id)}`, { body: values });
        await syncNow();
        router.back();
      } else {
        await send<MedicationDTO>('POST', `/patients/${encodeURIComponent(patientId)}/medications`, { body: values });
        await syncNow();
        router.replace({ pathname: '/paziente/[id]/terapie', params: { id: patientId } });
      }
    } catch (err) {
      setErrors(err instanceof ApiError && err.fields ? err.fields : {});
      setError(err instanceof ApiError ? (err.offline ? 'Serve la connessione: le terapie si salvano solo online.' : err.message) : 'Operazione non riuscita.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottom }]} keyboardShouldPersistTaps="handled">
        <Field
          label="Farmaco *"
          value={values.name}
          // Se si cambia il nome, il farmaco non è più quello scelto dall'elenco.
          onChangeText={(name) => setValues((v) => ({ ...v, name, aic: '' }))}
          error={errors.name}
          autoCorrect={false}
        />
        {suggestions.map((d) => (
          <Row key={d.aic} icon={Pill} title={d.name} subtitle={d.activeIngredient ?? undefined} onPress={() => pick(d)} />
        ))}
        <Field label="Principio attivo" {...text('activeIngredient')} />

        <Field label="Formulazione" placeholder="Es. compresse, sciroppo" {...text('form')} />
        {formOptions.length ? <Chips options={formOptions} value={values.form} onChange={set('form')} clearable /> : null}
        <Field label="Dosaggio" placeholder="Es. 500 mg" {...text('strength')} />
        {strengthOptions.length ? <Chips options={strengthOptions} value={values.strength} onChange={set('strength')} clearable /> : null}

        <Field label="Dose" placeholder="Es. 1 compressa, 20 gocce" {...text('dosage')} />
        <Field label="Quando" placeholder="Scegli o scrivi liberamente" {...text('frequency')} />
        <Chips options={FREQUENCIES.map((f) => ({ value: f, label: f }))} value={values.frequency} onChange={set('frequency')} clearable />

        <View style={styles.switchRow}>
          <Text style={[styles.label, { color: t.text }]}>Solo al bisogno</Text>
          <Switch accessibilityLabel="Solo al bisogno" value={values.asNeeded} onValueChange={(asNeeded) => setValues((v) => ({ ...v, asNeeded }))} />
        </View>

        <Field label="Per cosa" placeholder="Es. pressione alta" {...text('reason')} />
        <Field label="Prescritto da" {...text('prescriber')} />
        <DateField label="Dal" value={values.startDate} onChange={set('startDate')} error={errors.startDate} />
        <DateField label="Al (vuoto = terapia in corso)" value={values.endDate} onChange={set('endDate')} error={errors.endDate} />
        <Field label="Note" multiline style={styles.multiline} {...text('notes')} />

        <ErrorBox message={error} />
        <View style={styles.pair}>
          <View style={styles.flex}>
            <Button title="Annulla" icon={X} variant="secondary" disabled={saving} onPress={() => router.back()} />
          </View>
          <View style={styles.flex}>
            <Button title="Salva" icon={Save} busy={saving} onPress={() => void save()} />
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.md },
  label: { fontSize: 15, fontWeight: '600', flex: 1 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  multiline: { minHeight: 120, paddingTop: spacing.sm, textAlignVertical: 'top' },
  pair: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
