import type { ReportField, ReportTemplateDTO } from '@alby/shared';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Camera, FileText, Images, Plus, Trash2, TriangleAlert } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { ApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { getLocalPatient, listLocalTemplates } from '@/lib/local-data';
import {
  discardDocument,
  errorMessage,
  fieldValue,
  parseDateInput,
  plainDraft,
  readScan,
  saveReport,
  uploadDocument,
  validateDraft,
  withFieldValue,
  type DraftValues,
  type PickedDocument,
  type ReadDraft,
} from '@/lib/new-report';
import { useApi } from '@/lib/online';
import { useSync } from '@/lib/sync-context';
import { useLocal } from '@/lib/use-local';
import { Card, LocalView, Message, SectionTitle } from '@/ui/blocks';
import { Button, ErrorBox, Field } from '@/ui/controls';
import { useBottomSpace } from '@/ui/tab-bar';
import { radius, spacing, useTheme } from '@/ui/theme';

type Step =
  | { kind: 'choose'; error: string | null }
  | { kind: 'reading'; message: string }
  | { kind: 'form'; draft: ReadDraft; values: DraftValues; errors: Record<string, string>; saving: boolean; error: string | null };

async function loadPage(id: string) {
  const [patient, templates] = await Promise.all([getLocalPatient(id), listLocalTemplates()]);
  return patient && { patient, templates };
}

/**
 * Nuovo referto da una foto o da un PDF (solo online): il server legge il documento (con l'OCR se è una
 * scansione) e propone i campi; si controllano e si salva. Uscendo senza salvare il documento viene eliminato.
 */
export default function NewReportScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const result = useLocal(() => loadPage(id), [id]);
  const bottom = useBottomSpace();
  const { send } = useApi();
  const { syncNow } = useSync();
  const [step, setStep] = useState<Step>({ kind: 'choose', error: null });

  // Documento caricato ma non ancora salvato come referto: va eliminato se si esce.
  const pending = useRef<string | null>(null);
  const sendRef = useRef(send);
  sendRef.current = send;
  useEffect(
    () => () => {
      if (pending.current) void discardDocument(sendRef.current, pending.current);
    },
    [],
  );

  async function read(doc: PickedDocument, templates: ReportTemplateDTO[]) {
    setStep({ kind: 'reading', message: 'Invio del documento…' });
    try {
      const res = await uploadDocument(send, id, doc);
      if (res.draft === null) {
        Alert.alert('Documento già inserito', 'Questo documento è già in un referto del paziente.');
        router.replace({ pathname: '/referto/[id]', params: { id: res.existingReportId } });
        return;
      }
      const draft = res.draft;
      if (!draft.file) throw new ApiError(500, 'NO_FILE', 'Documento non salvato');
      pending.current = draft.file.id;
      let read = plainDraft({ ...draft, file: draft.file });
      if (draft.scan) {
        try {
          read = await readScan(send, { ...draft, file: draft.file, scan: draft.scan }, (page, total) =>
            setStep({ kind: 'reading', message: total > 1 ? `Lettura del testo: pagina ${page} di ${total}…` : 'Lettura del testo…' }),
          );
        } catch (err) {
          // L'OCR non è riuscito: si compila a mano, il documento resta collegato.
          read = { ...read, warnings: [`Lettura del testo non riuscita (${errorMessage(err)}): compila i campi a mano.`] };
        }
      }
      if (!templates.some((tpl) => tpl.id === read.values.templateId)) read.values.templateId = templates[0]?.id ?? '';
      setStep({ kind: 'form', draft: read, values: read.values, errors: {}, saving: false, error: null });
    } catch (err) {
      setStep({ kind: 'choose', error: errorMessage(err) });
    }
  }

  async function pick(source: 'camera' | 'gallery' | 'pdf', templates: ReportTemplateDTO[]) {
    if (source === 'pdf') {
      const res = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
      const asset = res.canceled ? null : res.assets[0];
      if (asset) await read({ uri: asset.uri, name: asset.name || 'referto.pdf', mimeType: 'application/pdf' }, templates);
      return;
    }
    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setStep({ kind: 'choose', error: 'Per fotografare il referto consenti l’uso della fotocamera nelle impostazioni del telefono.' });
        return;
      }
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.9 };
    const res = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    const asset = res.canceled ? null : res.assets[0];
    if (!asset) return;
    // Il server accetta solo JPEG: con `quality` < 1 Android salva sempre in JPEG.
    await read({ uri: asset.uri, name: `referto-${Date.now()}.jpg`, mimeType: 'image/jpeg' }, templates);
  }

  async function save(form: Extract<Step, { kind: 'form' }>, fields: ReportField[]) {
    const errors = validateDraft(form.values, fields);
    if (Object.keys(errors).length) {
      setStep({ ...form, errors, error: 'Controlla i campi evidenziati.' });
      return;
    }
    const confirmed =
      form.draft.uncertainRows.length === 0 ||
      (await new Promise<boolean>((resolve) =>
        Alert.alert('Valori da controllare', 'Alcuni valori sono stati letti con poca sicurezza. Li hai controllati?', [
          { text: 'Ricontrolla', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Salva', onPress: () => resolve(true) },
        ]),
      ));
    if (!confirmed) return;
    setStep({ ...form, errors: {}, saving: true, error: null });
    try {
      const report = await saveReport(send, id, form.draft, form.values, fields);
      pending.current = null;
      await syncNow();
      router.replace({ pathname: '/referto/[id]', params: { id: report.id } });
    } catch (err) {
      const fieldErrors = err instanceof ApiError && err.fields ? err.fields : {};
      setStep({ ...form, saving: false, errors: fieldErrors, error: errorMessage(err) });
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <Stack.Screen options={{ title: 'Nuovo referto' }} />
      <LocalView result={result} empty="Paziente non disponibile: forse l’accesso è stato revocato.">
        {({ patient, templates }) => {
          if (!patient.canEdit) return <Message>Non hai il permesso di aggiungere referti a questo paziente.</Message>;
          if (!templates.length) return <Message>Nessun tipo di referto disponibile: sincronizza e riprova.</Message>;

          if (step.kind === 'reading') {
            return (
              <View style={styles.center}>
                <ActivityIndicator size="large" color={t.primary} />
                <Text style={{ color: t.text, fontSize: 16, textAlign: 'center' }}>{step.message}</Text>
              </View>
            );
          }

          if (step.kind === 'choose') {
            return (
              <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottom }]}>
                <Card title={`${patient.lastName} ${patient.firstName}`}>
                  <Text style={{ color: t.muted, fontSize: 15 }}>
                    Fotografa il referto o scegli il documento: il testo viene letto in automatico, poi controlli i campi e salvi.
                  </Text>
                </Card>
                <ErrorBox message={step.error} />
                <Button title="Scatta una foto" icon={Camera} onPress={() => void pick('camera', templates)} />
                <Button title="Scegli dalla galleria" icon={Images} variant="secondary" onPress={() => void pick('gallery', templates)} />
                <Button title="Scegli un PDF" icon={FileText} variant="secondary" onPress={() => void pick('pdf', templates)} />
                <Message>Serve la connessione: il documento viene letto dal server.</Message>
              </ScrollView>
            );
          }

          const form = step;
          const template = templates.find((tpl) => tpl.id === form.values.templateId) ?? templates[0]!;
          const fields = template.fields;
          const setValues = (values: DraftValues) => setStep({ ...form, values });
          const set = (key: string, value: string) => setValues(withFieldValue(form.values, key, value));
          const cancel = () => router.back();

          return (
            <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
              <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottom }]} keyboardShouldPersistTaps="handled">
                {form.draft.identity && form.draft.identity.status !== 'ok' ? <Notice text={form.draft.identity.message} /> : null}
                {form.draft.warnings.map((w) => (
                  <Notice key={w} text={w} />
                ))}
                {form.draft.scanned ? <Notice text="Testo letto con l’OCR: controlla sempre virgole, punti e unità di misura." /> : null}

                <SectionTitle>Tipo di referto</SectionTitle>
                <Chips options={templates.map((tpl) => ({ value: tpl.id, label: tpl.name }))} value={template.id} onChange={(templateId) => setValues({ ...form.values, templateId })} />

                <Field label="Titolo *" value={form.values.title} onChangeText={(v) => set('title', v)} error={form.errors.title} />
                <DateField label="Data dell’esame *" value={form.values.examDate} onChange={(v) => set('examDate', v)} error={form.errors.examDate} />
                {fields.map((f) => (
                  <FieldInput key={f.key} field={f} values={form.values} errors={form.errors} onChange={set} onValues={setValues} uncertain={form.draft.uncertainRows} />
                ))}
                <Field label="Note personali" value={form.values.notes} onChangeText={(v) => set('notes', v)} multiline style={styles.multiline} error={form.errors.notes} />

                <ErrorBox message={form.error} />
                <Button title="Salva il referto" busy={form.saving} onPress={() => void save(form, fields)} />
                <Button title="Annulla" variant="secondary" disabled={form.saving} onPress={cancel} />
              </ScrollView>
            </KeyboardAvoidingView>
          );
        }}
      </LocalView>
    </View>
  );
}

function Notice({ text }: { text: string }) {
  const t = useTheme();
  return (
    <View style={[styles.notice, { backgroundColor: t.warningSurface }]}>
      <TriangleAlert size={18} color={t.warning} />
      <Text style={{ color: t.text, fontSize: 14, flex: 1 }}>{text}</Text>
    </View>
  );
}

function Chips({
  options,
  value,
  onChange,
  clearable,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange(value: string): void;
  /** Toccando la voce scelta la si toglie (campi facoltativi). */
  clearable?: boolean;
}) {
  const t = useTheme();
  return (
    <View style={styles.chips}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(selected && clearable ? '' : o.value)}
            style={[styles.chip, { backgroundColor: selected ? t.primary : t.surface, borderColor: selected ? t.primary : t.border }]}
          >
            <Text style={{ color: selected ? t.onPrimary : t.text, fontSize: 15 }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Data scritta come GG/MM/AAAA; nel form resta AAAA-MM-GG quando è valida, altrimenti il testo così com'è. */
function DateField({ label, value, onChange, error }: { label: string; value: string; onChange(value: string): void; error?: string }) {
  const shown = /^\d{4}-\d{2}-\d{2}$/.test(value) ? formatDate(value) : value;
  return (
    <Field
      label={label}
      value={shown}
      placeholder="GG/MM/AAAA"
      keyboardType="numbers-and-punctuation"
      onChangeText={(text) => onChange(parseDateInput(text) ?? text)}
      error={error}
    />
  );
}

function FieldInput({
  field: f,
  values,
  errors,
  onChange,
  onValues,
  uncertain,
}: {
  field: ReportField;
  values: DraftValues;
  errors: Record<string, string>;
  onChange(key: string, value: string): void;
  onValues(values: DraftValues): void;
  uncertain: number[];
}) {
  const t = useTheme();
  const label = `${f.label}${f.required ? ' *' : ''}`;
  const error = errors[f.key] ?? errors[`custom.${f.key}`];
  const value = fieldValue(values, f.key);
  switch (f.type) {
    case 'lab_table':
      return <LabTable values={values} errors={errors} onValues={onValues} uncertain={uncertain} error={error} />;
    case 'date':
      return <DateField label={label} value={value} onChange={(v) => onChange(f.key, v)} error={error} />;
    case 'textarea':
    case 'rich_text':
      return <Field label={label} value={value} onChangeText={(v) => onChange(f.key, v)} multiline style={styles.multiline} error={error} />;
    case 'number':
      return <Field label={label} value={value} onChangeText={(v) => onChange(f.key, v)} keyboardType="decimal-pad" error={error} />;
    case 'select':
      return (
        <View style={{ gap: spacing.xs }}>
          <Text style={[styles.label, { color: t.text }]}>{label}</Text>
          <Chips options={f.options.map((o) => ({ value: o, label: o }))} value={value} onChange={(v) => onChange(f.key, v)} clearable />
          {error ? <Text style={{ color: t.danger, fontSize: 13 }}>{error}</Text> : null}
        </View>
      );
    case 'checkbox':
      return (
        <View style={styles.switchRow}>
          <Text style={[styles.label, { color: t.text, flex: 1 }]}>{label}</Text>
          <Switch accessibilityLabel={f.label} value={value === 'true'} onValueChange={(on) => onChange(f.key, on ? 'true' : '')} />
          {error ? <Text style={{ color: t.danger, fontSize: 13 }}>{error}</Text> : null}
        </View>
      );
    default:
      return <Field label={label} value={value} onChangeText={(v) => onChange(f.key, v)} error={error} />;
  }
}

/** Tabella dei valori: una scheda per riga (esame, valore, unità, intervallo), con quelle incerte evidenziate. */
function LabTable({
  values,
  errors,
  onValues,
  uncertain,
  error,
}: {
  values: DraftValues;
  errors: Record<string, string>;
  onValues(values: DraftValues): void;
  uncertain: number[];
  error?: string;
}) {
  const t = useTheme();
  const rows = values.results;
  const setRow = (i: number, patch: Partial<DraftValues['results'][number]>) =>
    // Il fuori range lo ricalcola il server dal valore e dall'intervallo.
    onValues({ ...values, results: rows.map((r, j) => (j === i ? { ...r, ...patch, outOfRange: null } : r)) });
  return (
    <View style={{ gap: spacing.sm }}>
      <SectionTitle>{rows.length === 1 ? '1 valore' : `${rows.length} valori`}</SectionTitle>
      {error ? <Text style={{ color: t.danger, fontSize: 13 }}>{error}</Text> : null}
      {rows.map((r, i) => (
        <Card key={i} style={uncertain.includes(i) ? { borderColor: t.warning } : undefined}>
          {uncertain.includes(i) ? <Text style={{ color: t.warning, fontSize: 13, fontWeight: '600' }}>Letto con poca sicurezza: controlla</Text> : null}
          <Field label="Esame" value={r.name} onChangeText={(name) => setRow(i, { name })} error={errors[`results.${i}.name`]} />
          <View style={styles.pair}>
            <View style={{ flex: 1 }}>
              <Field label="Valore" value={r.value} onChangeText={(value) => setRow(i, { value })} error={errors[`results.${i}.value`]} />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Unità" value={r.unit} onChangeText={(unit) => setRow(i, { unit })} />
            </View>
          </View>
          <Field label="Valori di riferimento" value={r.referenceRange} onChangeText={(referenceRange) => setRow(i, { referenceRange })} />
          <Button title="Togli" icon={Trash2} variant="secondary" onPress={() => onValues({ ...values, results: rows.filter((_, j) => j !== i) })} />
        </Card>
      ))}
      <Button
        title="Aggiungi un valore"
        icon={Plus}
        variant="secondary"
        onPress={() => onValues({ ...values, results: [...rows, { section: '', name: '', value: '', unit: '', referenceRange: '', outOfRange: null }] })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.lg },
  notice: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md, borderRadius: radius, alignItems: 'flex-start' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  label: { fontSize: 15, fontWeight: '600' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  multiline: { minHeight: 120, paddingTop: spacing.sm, textAlignVertical: 'top' },
  pair: { flexDirection: 'row', gap: spacing.sm },
});
