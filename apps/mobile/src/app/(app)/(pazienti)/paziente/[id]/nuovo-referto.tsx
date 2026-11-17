import { reportFieldOcrMode, type ReportField, type ReportTemplateDTO, type ScanRegion } from '@alby/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Camera, Plus, ScanText, Trash2, TriangleAlert } from 'lucide-react-native';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { ApiError } from '@/lib/api';
import { DEVICE_PARSER, readZone, recognizePhoto, type PhotoText, type ZoneMode } from '@/lib/device-ocr';
import { formatDate } from '@/lib/format';
import { getLocalPatient, listLocalTemplates } from '@/lib/local-data';
import {
  discardDocument,
  emptyValues,
  errorMessage,
  fieldValue,
  parseDateInput,
  saveReport,
  uploadDocument,
  validateDraft,
  withFieldValue,
  type DraftValues,
} from '@/lib/new-report';
import { useApi } from '@/lib/online';
import { useSync } from '@/lib/sync-context';
import { useLocal } from '@/lib/use-local';
import { Card, LocalView, Message, SectionTitle } from '@/ui/blocks';
import { Button, ErrorBox, Field } from '@/ui/controls';
import { useBottomSpace } from '@/ui/tab-bar';
import { glassEdge, radius, spacing, useTheme } from '@/ui/theme';
import { ZonePicker, type PickedPhoto } from '@/ui/zone-picker';

/** Foto del referto letta sul telefono: le sue zone si leggono all'istante. */
type Photo = PhotoText & { uri: string; pixelWidth: number; pixelHeight: number };

/** Campo da compilare leggendo una zona della foto. */
type ZoneTarget = { key: string; label: string; mode: ZoneMode };

async function loadPage(id: string) {
  const [patient, templates] = await Promise.all([getLocalPatient(id), listLocalTemplates()]);
  return patient && { patient, templates };
}

/**
 * Nuovo referto: si compila a mano, oppure campo per campo dalla foto del referto (il bottone accanto al
 * campo apre la fotocamera: si inquadra, si sposta il riquadro sul testo e si scatta). Il testo
 * si riconosce sul telefono; la foto va sul server e resta allegata al referto. Per salvare serve la connessione.
 */
export default function NewReportScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const result = useLocal(() => loadPage(id), [id]);
  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <Stack.Screen options={{ title: 'Nuovo referto' }} />
      <LocalView result={result} empty="Paziente non disponibile: forse l’accesso è stato revocato.">
        {({ patient, templates }) =>
          !patient.canEdit ? (
            <Message>Non hai il permesso di aggiungere referti a questo paziente.</Message>
          ) : !templates.length ? (
            <Message>Nessun tipo di referto disponibile: sincronizza e riprova.</Message>
          ) : (
            <ReportForm patientId={id} templates={templates} />
          )
        }
      </LocalView>
    </View>
  );
}

function ReportForm({ patientId, templates }: { patientId: string; templates: ReportTemplateDTO[] }) {
  const t = useTheme();
  const bottom = useBottomSpace();
  const { send } = useApi();
  const { syncNow } = useSync();
  const [values, setValues] = useState<DraftValues>(() => emptyValues(templates[0]!.id));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [reading, setReading] = useState(false);
  const [zone, setZone] = useState<ZoneTarget | null>(null);
  /** Qualcosa è stato letto dalla foto: il referto si salva come letto da una scansione. */
  const [usedOcr, setUsedOcr] = useState(false);

  // Caricamento della foto sul server (parte appena scattata): l'id del documento, o null se non riuscito.
  const upload = useRef<Promise<string | null> | null>(null);
  // Documento caricato e non ancora diventato un referto: si elimina uscendo senza salvare.
  const pending = useRef<string | null>(null);
  const sendRef = useRef(send);
  sendRef.current = send;
  useEffect(
    () => () => {
      const unsaved = upload.current;
      if (!unsaved) return;
      void unsaved.then((fileId) => {
        if (fileId && pending.current === fileId) void discardDocument(sendRef.current, fileId);
      });
    },
    [],
  );

  const template = templates.find((tpl) => tpl.id === values.templateId) ?? templates[0]!;
  const fields = template.fields;
  const set = (key: string, value: string) => setValues((v) => withFieldValue(v, key, value));

  function forget(previous: Promise<string | null> | null) {
    void previous?.then((fileId) => {
      if (fileId) void discardDocument(send, fileId);
    });
  }

  function startUpload(uri: string) {
    forget(upload.current);
    pending.current = null;
    upload.current = uploadDocument(send, patientId, { uri, name: `referto-${Date.now()}.jpg`, mimeType: 'image/jpeg' })
      .then((res) => {
        if (res.draft === null) {
          Alert.alert('Foto già inserita', 'Questa foto è già allegata a un altro referto del paziente: il nuovo referto verrà salvato senza.');
          return null;
        }
        pending.current = res.draft.file?.id ?? null;
        return pending.current;
      })
      // Senza connessione la lettura funziona lo stesso: la foto si riprova a inviare al salvataggio.
      .catch(() => null);
  }

  /** Bottone accanto al campo: si inquadra il referto e si sceglie la zona da leggere. */
  const readField = (target: ZoneTarget) => () => {
    setError(null);
    setZone(target);
  };

  /** Lettura non riuscita: un avviso subito visibile (il riquadro degli errori è in fondo al form). */
  const notFound = (message: string) => Alert.alert('Niente da inserire', message);

  /** Zona scelta (sulla foto appena scattata o su quella già fatta): se ne legge il testo e si compila il campo. */
  async function onZone({ photo: picked, isNew, region }: { photo: PickedPhoto; isNew: boolean; region: ScanRegion }) {
    const target = zone;
    setZone(null);
    if (!target) return;
    let text = isNew ? null : photo;
    if (!text) {
      setReading(true);
      try {
        text = { ...(await recognizePhoto(picked.uri, picked.width, picked.height)), uri: picked.uri, pixelWidth: picked.width, pixelHeight: picked.height };
      } catch {
        notFound('Lettura della foto non riuscita.');
        return;
      } finally {
        setReading(false);
      }
      // La prima foto resta allegata al referto e si può riusare per gli altri campi.
      if (!photo) {
        setPhoto(text);
        startUpload(picked.uri);
      }
    }
    setUsedOcr(true);
    if (target.mode === 'table') {
      const rows = readZone(text, region, 'table');
      if (!rows.length) notFound('Nella zona scelta non ho trovato valori: includi nome, valore e unità.');
      // Le righe lette si aggiungono a quelle già compilate (quelle vuote si tolgono).
      else setValues((v) => ({ ...v, results: [...v.results.filter((r) => r.name || r.value), ...rows] }));
      return;
    }
    const value = readZone(text, region, target.mode);
    if (value) set(target.key, value);
    else notFound(target.mode === 'date' ? 'Nella zona scelta non ho trovato una data.' : 'Nella zona scelta non ho trovato testo.');
  }

  /** Toglie la foto allegata (ed elimina il documento già inviato). */
  function removePhoto() {
    forget(upload.current);
    upload.current = null;
    pending.current = null;
    setPhoto(null);
  }

  async function save() {
    const found = validateDraft(values, fields);
    setErrors(found);
    if (Object.keys(found).length) {
      setError('Controlla i campi evidenziati.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const fileId = (await upload.current) ?? null;
      const report = await saveReport(send, patientId, values, fields, fileId ? { fileId, parser: usedOcr ? DEVICE_PARSER : null } : null);
      pending.current = null;
      await syncNow();
      router.replace({ pathname: '/referto/[id]', params: { id: report.id } });
    } catch (err) {
      setErrors(err instanceof ApiError && err.fields ? err.fields : {});
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  const ocrButton = (target: ZoneTarget) => <OcrButton label={target.label} onPress={readField(target)} />;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottom }]} keyboardShouldPersistTaps="handled">
        <SectionTitle>Tipo di referto</SectionTitle>
        <Chips options={templates.map((tpl) => ({ value: tpl.id, label: tpl.name }))} value={template.id} onChange={(templateId) => setValues((v) => ({ ...v, templateId }))} />

        {photo ? (
          <View style={[styles.photoBar, { backgroundColor: t.primarySurface }]}>
            <Camera size={18} color={t.primary} />
            <Text style={{ color: t.text, fontSize: 14, flex: 1 }}>Foto del referto allegata.</Text>
            <Pressable accessibilityRole="button" onPress={removePhoto} hitSlop={8}>
              <Text style={{ color: t.primary, fontWeight: '600' }}>Togli</Text>
            </Pressable>
          </View>
        ) : null}
        {usedOcr ? <Notice text="Controlla sempre il testo letto dalla foto: virgole, punti e unità di misura possono essere letti male." /> : null}

        <Field
          label="Titolo *"
          value={values.title}
          onChangeText={(v) => set('title', v)}
          error={errors.title}
          accessory={ocrButton({ key: 'title', label: 'Titolo', mode: 'line' })}
        />
        <DateField
          label="Data dell’esame *"
          value={values.examDate}
          onChange={(v) => set('examDate', v)}
          error={errors.examDate}
          accessory={ocrButton({ key: 'examDate', label: 'Data dell’esame', mode: 'date' })}
        />
        {fields.map((f) => {
          const mode = f.ocr_enabled ? reportFieldOcrMode(f.type) : null;
          return (
            <FieldInput
              key={f.key}
              field={f}
              values={values}
              errors={errors}
              onChange={set}
              onValues={setValues}
              accessory={mode ? ocrButton({ key: f.key, label: f.label, mode }) : undefined}
            />
          );
        })}
        <Field label="Note personali" value={values.notes} onChangeText={(v) => set('notes', v)} multiline style={styles.multiline} error={errors.notes} />

        <ErrorBox message={error} />
        <Button title="Salva il referto" busy={saving} onPress={() => void save()} />
        <Button title="Annulla" variant="secondary" disabled={saving} onPress={() => router.back()} />
      </ScrollView>

      <ZonePicker
        target={zone}
        photo={photo ? { uri: photo.uri, width: photo.pixelWidth, height: photo.pixelHeight } : null}
        onDone={(res) => void onZone(res)}
        onClose={() => setZone(null)}
      />
      <Modal visible={reading} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.overlay}>
          <View style={[styles.overlayBox, { backgroundColor: t.surface }]}>
            <ActivityIndicator size="large" color={t.primary} />
            <Text style={{ color: t.text, fontSize: 16 }}>Lettura del testo…</Text>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

/** Bottone quadrato accanto a un campo: legge il campo da una zona della foto del referto. */
function OcrButton({ label, onPress }: { label: string; onPress(): void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Leggi ${label} dalla foto`}
      onPress={onPress}
      style={({ pressed }) => [styles.ocrButton, glassEdge(t), { backgroundColor: t.primarySurface }, pressed && { opacity: 0.6 }]}
    >
      <ScanText size={22} color={t.primary} />
    </Pressable>
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
function DateField({
  label,
  value,
  onChange,
  error,
  accessory,
}: {
  label: string;
  value: string;
  onChange(value: string): void;
  error?: string;
  accessory?: ReactNode;
}) {
  const shown = /^\d{4}-\d{2}-\d{2}$/.test(value) ? formatDate(value) : value;
  return (
    <Field
      label={label}
      value={shown}
      placeholder="GG/MM/AAAA"
      keyboardType="numbers-and-punctuation"
      onChangeText={(text) => onChange(parseDateInput(text) ?? text)}
      error={error}
      accessory={accessory}
    />
  );
}

function FieldInput({
  field: f,
  values,
  errors,
  onChange,
  onValues,
  accessory,
}: {
  field: ReportField;
  values: DraftValues;
  errors: Record<string, string>;
  onChange(key: string, value: string): void;
  onValues(update: (values: DraftValues) => DraftValues): void;
  /** Bottone per leggere il campo dalla foto (solo per i campi che lo prevedono). */
  accessory?: ReactNode;
}) {
  const t = useTheme();
  const label = `${f.label}${f.required ? ' *' : ''}`;
  const error = errors[f.key] ?? errors[`custom.${f.key}`];
  const value = fieldValue(values, f.key);
  const change = (v: string) => onChange(f.key, v);
  switch (f.type) {
    case 'lab_table':
      return <LabTable values={values} errors={errors} onValues={onValues} error={error} accessory={accessory} />;
    case 'date':
      return <DateField label={label} value={value} onChange={change} error={error} accessory={accessory} />;
    case 'textarea':
    case 'rich_text':
      return <Field label={label} value={value} onChangeText={change} multiline style={styles.multiline} error={error} accessory={accessory} />;
    case 'number':
      return <Field label={label} value={value} onChangeText={change} keyboardType="decimal-pad" error={error} accessory={accessory} />;
    case 'select':
      return (
        <View style={{ gap: spacing.xs }}>
          <Text style={[styles.label, { color: t.text }]}>{label}</Text>
          <Chips options={f.options.map((o) => ({ value: o, label: o }))} value={value} onChange={change} clearable />
          {error ? <Text style={{ color: t.danger, fontSize: 13 }}>{error}</Text> : null}
        </View>
      );
    case 'checkbox':
      return (
        <View style={styles.switchRow}>
          <Text style={[styles.label, { color: t.text, flex: 1 }]}>{label}</Text>
          <Switch accessibilityLabel={f.label} value={value === 'true'} onValueChange={(on) => change(on ? 'true' : '')} />
          {error ? <Text style={{ color: t.danger, fontSize: 13 }}>{error}</Text> : null}
        </View>
      );
    default:
      return <Field label={label} value={value} onChangeText={change} error={error} accessory={accessory} />;
  }
}

/** Tabella dei valori: una scheda per riga (esame, valore, unità, intervallo). */
function LabTable({
  values,
  errors,
  onValues,
  error,
  accessory,
}: {
  values: DraftValues;
  errors: Record<string, string>;
  onValues(update: (values: DraftValues) => DraftValues): void;
  error?: string;
  accessory?: ReactNode;
}) {
  const t = useTheme();
  const rows = values.results;
  const setRow = (i: number, patch: Partial<DraftValues['results'][number]>) =>
    // Il fuori range lo ricalcola il server dal valore e dall'intervallo.
    onValues((v) => ({ ...v, results: v.results.map((r, j) => (j === i ? { ...r, ...patch, outOfRange: null } : r)) }));
  return (
    <View style={{ gap: spacing.sm }}>
      <SectionTitle right={accessory}>{rows.length === 1 ? '1 valore' : `${rows.length} valori`}</SectionTitle>
      {error ? <Text style={{ color: t.danger, fontSize: 13 }}>{error}</Text> : null}
      {rows.map((r, i) => (
        <Card key={i}>
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
          <Button title="Togli" icon={Trash2} variant="secondary" onPress={() => onValues((v) => ({ ...v, results: v.results.filter((_, j) => j !== i) }))} />
        </Card>
      ))}
      <Button
        title="Aggiungi un valore"
        icon={Plus}
        variant="secondary"
        onPress={() => onValues((v) => ({ ...v, results: [...v.results, { section: '', name: '', value: '', unit: '', referenceRange: '', outOfRange: null }] }))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.md },
  notice: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md, borderRadius: radius, alignItems: 'flex-start' },
  photoBar: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md, borderRadius: radius, alignItems: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  label: { fontSize: 15, fontWeight: '600' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  multiline: { minHeight: 120, paddingTop: spacing.sm, textAlignVertical: 'top' },
  pair: { flexDirection: 'row', gap: spacing.sm },
  ocrButton: { width: 52, height: 52, borderRadius: radius, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  overlayBox: { padding: spacing.lg, borderRadius: radius, alignItems: 'center', gap: spacing.md },
});
