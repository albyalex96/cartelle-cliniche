import { BLOOD_TYPES, patientInputSchema, SEX_LABELS, SEXES, type PatientDTO } from '@alby/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Save, X } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';
import { ApiError } from '@/lib/api';
import { getLocalPatient } from '@/lib/local-data';
import { useApi } from '@/lib/online';
import { useSession } from '@/lib/session';
import { useSync } from '@/lib/sync-context';
import { useLocal } from '@/lib/use-local';
import { LocalView, Message, SectionTitle } from '@/ui/blocks';
import { Button, Chips, DateField, ErrorBox, Field } from '@/ui/controls';
import { useBottomSpace } from '@/ui/tab-bar';
import { spacing, useTheme } from '@/ui/theme';

const emptyValues = () => ({
  firstName: '',
  lastName: '',
  birthDate: '',
  sex: '',
  fiscalCode: '',
  bloodType: '',
  phone: '',
  email: '',
  notes: '',
});

type Values = ReturnType<typeof emptyValues>;

const valuesOf = (p: PatientDTO): Values => {
  const out = emptyValues();
  for (const key of Object.keys(out) as (keyof Values)[]) out[key] = p[key] ?? '';
  return out;
};

/**
 * Dati anagrafici di un paziente: nuovo (solo amministratori) o modifica di uno esistente (`id`, con il permesso
 * di modifica). Per salvare serve la connessione.
 */
export default function PatientDataScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { user } = useSession();
  const result = useLocal(async () => (id ? { patient: await getLocalPatient(id) } : { patient: null }), [id]);
  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <Stack.Screen options={{ title: id ? 'Modifica paziente' : 'Nuovo paziente' }} />
      <LocalView result={result}>
        {({ patient }) =>
          id && !patient ? (
            <Message>Paziente non disponibile: forse l’accesso è stato revocato.</Message>
          ) : (patient ? !patient.canEdit : user?.role !== 'ADMIN') ? (
            <Message>Non hai il permesso di {patient ? 'modificare questo paziente' : 'aggiungere pazienti'}.</Message>
          ) : (
            <PatientForm patient={patient} />
          )
        }
      </LocalView>
    </View>
  );
}

function PatientForm({ patient }: { patient: PatientDTO | null }) {
  const bottom = useBottomSpace();
  const { send } = useApi();
  const { syncNow } = useSync();
  const [values, setValues] = useState<Values>(() => (patient ? valuesOf(patient) : emptyValues()));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = (key: keyof Values) => (value: string) => setValues((v) => ({ ...v, [key]: value }));
  const text = (key: keyof Values) => ({ value: values[key], onChangeText: set(key), error: errors[key] });

  async function save() {
    const parsed = patientInputSchema.safeParse(values);
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
      if (patient) {
        await send<PatientDTO>('PUT', `/patients/${encodeURIComponent(patient.id)}`, { body: values });
        await syncNow();
        router.back();
      } else {
        const created = await send<PatientDTO>('POST', '/patients', { body: values });
        await syncNow();
        router.replace({ pathname: '/paziente/[id]', params: { id: created.id } });
      }
    } catch (err) {
      setErrors(err instanceof ApiError && err.fields ? err.fields : {});
      setError(err instanceof ApiError ? (err.offline ? 'Serve la connessione: i dati dei pazienti si salvano solo online.' : err.message) : 'Operazione non riuscita.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottom }]} keyboardShouldPersistTaps="handled">
        <Field label="Cognome *" autoCapitalize="words" {...text('lastName')} />
        <Field label="Nome *" autoCapitalize="words" {...text('firstName')} />
        <DateField label="Data di nascita" value={values.birthDate} onChange={set('birthDate')} error={errors.birthDate} />
        <SectionTitle>Sesso</SectionTitle>
        <Chips options={SEXES.map((s) => ({ value: s, label: SEX_LABELS[s] }))} value={values.sex} onChange={set('sex')} clearable />
        <Field label="Codice fiscale" autoCapitalize="characters" autoCorrect={false} maxLength={16} {...text('fiscalCode')} />
        <SectionTitle>Gruppo sanguigno</SectionTitle>
        <Chips options={BLOOD_TYPES.map((b) => ({ value: b, label: b }))} value={values.bloodType} onChange={set('bloodType')} clearable />
        <Field label="Telefono" keyboardType="phone-pad" {...text('phone')} />
        <Field label="Email" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} {...text('email')} />
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
  multiline: { minHeight: 120, paddingTop: spacing.sm, textAlignVertical: 'top' },
  pair: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
