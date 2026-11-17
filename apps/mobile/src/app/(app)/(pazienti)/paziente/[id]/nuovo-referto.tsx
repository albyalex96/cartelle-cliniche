import { reportFieldOcrMode, type ReportField, type ReportTemplateDTO, type ScanRegion } from '@alby/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { FileText, FileUp, Image as ImageIcon, ImagePlus, ListOrdered, Plus, Save, ScanText, Trash2, TriangleAlert, X, type LucideIcon } from 'lucide-react-native';
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
  uploadImage,
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
import { enqueueReport } from '@/lib/outbox';
import { SequenceReader, type SequenceStep, type SequenceValue } from '@/ui/sequence-reader';
import { ZonePicker, type PickedPhoto } from '@/ui/zone-picker';

/** Foto del referto letta sul telefono: le sue zone si leggono all'istante. */
type Photo = PhotoText & { uri: string; pixelWidth: number; pixelHeight: number };

/** PDF del referto, già inviato al server (`pageCount`: pagine per la compilazione sequenziale). */
type UploadedPdf = {
  name: string;
  /** Il file sul telefono (serve se il PDF va messo in coda per l'invio). */
  uri: string;
  mimeType: string;
  /** null = scelto senza connessione: resta sul telefono e parte con il referto. */
  fileId: string | null;
  pageCount: number;
};

/** Immagine scelta sul telefono, da inviare al salvataggio. */
type Attachment = { uri: string; name: string; mimeType: string };

/** Campo da compilare leggendo una zona della foto. */
type ZoneTarget = { key: string; label: string; mode: ZoneMode };

async function loadPage(id: string) {
  const [patient, templates] = await Promise.all([getLocalPatient(id), listLocalTemplates()]);
  return patient && { patient, templates };
}

/**
 * Nuovo referto: si compila a mano, oppure campo per campo da una foto (il bottone accanto al campo apre la
 * fotocamera: si inquadra il testo nel riquadro e si scatta). Il testo si riconosce sul telefono e le foto
 * della lettura non si salvano. PDF e immagini del referto si allegano con i bottoni in fondo e vanno sul
 * server al salvataggio, che richiede la connessione.
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
  const { send, download } = useApi();
  const { syncNow } = useSync();
  const [values, setValues] = useState<DraftValues>(() => emptyValues(templates[0]!.id));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Foto fatte per leggere i campi: restano sul telefono (la prima si riusa per gli altri campi), non si salvano.
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [reading, setReading] = useState(false);
  const [zone, setZone] = useState<ZoneTarget | null>(null);
  const [usedOcr, setUsedOcr] = useState(false);
  // Allegati scelti con i bottoni in fondo: vanno sul server solo al salvataggio.
  // Il PDF va sul server appena scelto: servono le sue pagine per la compilazione sequenziale.
  const [pdf, setPdf] = useState<UploadedPdf | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [sequence, setSequence] = useState(false);
  const [usedPdfOcr, setUsedPdfOcr] = useState(false);
  // PDF inviato e non ancora diventato un referto: si elimina uscendo senza salvare.
  const unsavedPdf = useRef<string | null>(null);
  const sendRef = useRef(send);
  sendRef.current = send;
  useEffect(
    () => () => {
      if (unsavedPdf.current) void discardDocument(sendRef.current, unsavedPdf.current);
    },
    [],
  );
  const [images, setImages] = useState<Attachment[]>([]);
  const [progress, setProgress] = useState<string | null>(null);

  const template = templates.find((tpl) => tpl.id === values.templateId) ?? templates[0]!;
  const fields = template.fields;
  const set = (key: string, value: string) => setValues((v) => withFieldValue(v, key, value));

  async function choosePdf() {
    // PDF o foto JPG del referto: la foto diventa un PDF di una pagina (anche per la modalità sequenziale).
    const res = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/jpeg'], copyToCacheDirectory: true });
    const asset = res.canceled ? null : res.assets[0];
    if (!asset) return;
    setPdfBusy(true);
    setError(null);
    const isJpeg = asset.mimeType === 'image/jpeg' || /\.jpe?g$/i.test(asset.name ?? '');
    const original = asset.name || (isJpeg ? 'referto.jpg' : 'referto.pdf');
    const mimeType = isJpeg ? 'image/jpeg' : 'application/pdf';
    try {
      const uploaded = await uploadDocument(send, patientId, { uri: asset.uri, name: original, mimeType });
      // Nome come lo salva il server (la foto convertita diventa ".pdf").
      const name = uploaded.draft?.file?.fileName ?? original;
      if (uploaded.draft === null) {
        Alert.alert('PDF già inserito', 'Questo PDF è già allegato a un altro referto del paziente.');
        return;
      }
      const fileId = uploaded.draft.file?.id;
      if (!fileId) throw new ApiError(500, 'NO_FILE', 'PDF non salvato');
      removePdf();
      unsavedPdf.current = fileId;
      setPdf({ name, uri: asset.uri, mimeType, fileId, pageCount: uploaded.draft.pages?.length ?? 0 });
    } catch (err) {
      if (err instanceof ApiError && err.offline) {
        // Senza connessione il PDF resta sul telefono e parte insieme al referto (niente modalità sequenziale).
        removePdf();
        setPdf({ name: original, uri: asset.uri, mimeType, fileId: null, pageCount: 0 });
        return;
      }
      setError(errorMessage(err));
    } finally {
      setPdfBusy(false);
    }
  }

  /** Toglie il PDF (ed elimina quello già inviato). */
  function removePdf() {
    if (unsavedPdf.current) void discardDocument(send, unsavedPdf.current);
    unsavedPdf.current = null;
    setPdf(null);
    setUsedPdfOcr(false);
  }

  /** Campi della compilazione sequenziale, nell'ordine del form (come nella webapp): data, titolo, campi leggibili. */
  const sequenceSteps: SequenceStep[] = [
    { key: 'examDate', label: 'Data dell’esame', mode: 'date' },
    { key: 'title', label: 'Titolo', mode: 'line' },
    ...fields.flatMap((f) => {
      const mode = f.ocr_enabled ? reportFieldOcrMode(f.type) : null;
      return mode ? [{ key: f.key, label: f.label, mode }] : [];
    }),
  ];

  function confirmStep(step: SequenceStep, value: SequenceValue) {
    setUsedPdfOcr(true);
    if (value.kind === 'rows') setValues((v) => ({ ...v, results: [...v.results.filter((r) => r.name || r.value), ...value.rows] }));
    else set(step.key, value.text);
  }

  async function addImages(source: 'camera' | 'gallery') {
    if (source === 'camera' && !(await ImagePicker.requestCameraPermissionsAsync()).granted) {
      setError('Per fotografare consenti l’uso della fotocamera nelle impostazioni del telefono.');
      return;
    }
    const res =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9, allowsMultipleSelection: true, selectionLimit: 20 });
    if (res.canceled) return;
    const added = res.assets.map((a, i) => ({ uri: a.uri, name: a.fileName || `immagine-${Date.now()}-${i + 1}.jpg`, mimeType: a.mimeType || 'image/jpeg' }));
    setImages((list) => [...list, ...added]);
  }

  function chooseImages() {
    Alert.alert('Immagini del referto', 'Scatta una foto o scegli le immagini dalla galleria.', [
      { text: 'Annulla', style: 'cancel' },
      { text: 'Galleria', onPress: () => void addImages('gallery') },
      { text: 'Fotocamera', onPress: () => void addImages('camera') },
    ]);
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
      // La prima foto si tiene (solo sul telefono) per leggere anche gli altri campi.
      if (!photo) setPhoto(text);
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

  /** Senza connessione: il referto (con PDF e immagini) resta sul telefono e si invia da solo appena possibile. */
  async function saveOffline() {
    try {
      setProgress('Salvataggio sul telefono…');
      await enqueueReport(
        patientId,
        { values, fields, parser: pdf && usedPdfOcr ? DEVICE_PARSER : null, fileId: pdf?.fileId ?? null },
        { pdf: pdf && !pdf.fileId ? { uri: pdf.uri, name: pdf.name, mimeType: pdf.mimeType } : null, images },
      );
      // Il PDF già inviato ora appartiene al referto in coda: non va eliminato uscendo.
      unsavedPdf.current = null;
      void syncNow();
      Alert.alert('Salvato sul telefono', 'Manca la connessione: il referto verrà inviato da solo appena torna la rete.');
      router.back();
    } catch {
      setError('Salvataggio sul telefono non riuscito.');
    }
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
      const studyIds: string[] = [];
      for (const [i, image] of images.entries()) {
        setProgress(`Invio delle immagini: ${i + 1} di ${images.length}…`);
        studyIds.push(await uploadImage(send, patientId, image, values.examDate));
      }
      setProgress('Salvataggio…');
      const report = await saveReport(send, patientId, values, fields, {
        fileId: pdf?.fileId ?? null,
        // Campi letti dal PDF: il referto risulta letto da una scansione, come nella webapp.
        parser: pdf && usedPdfOcr ? DEVICE_PARSER : null,
        studyIds,
      });
      unsavedPdf.current = null;
      await syncNow();
      router.replace({ pathname: '/referto/[id]', params: { id: report.id } });
    } catch (err) {
      if (err instanceof ApiError && err.offline) {
        await saveOffline();
        return;
      }
      setErrors(err instanceof ApiError && err.fields ? err.fields : {});
      setError(errorMessage(err));
    } finally {
      setProgress(null);
      setSaving(false);
    }
  }

  const ocrButton = (target: ZoneTarget) => <OcrButton label={target.label} onPress={readField(target)} />;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottom }]} keyboardShouldPersistTaps="handled">
        <SectionTitle>Tipo di referto</SectionTitle>
        <Chips options={templates.map((tpl) => ({ value: tpl.id, label: tpl.name }))} value={template.id} onChange={(templateId) => setValues((v) => ({ ...v, templateId }))} />

        {usedOcr || usedPdfOcr ? <Notice text="Controlla sempre il testo letto dalla foto: virgole, punti e unità di misura possono essere letti male." /> : null}

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

        <SectionTitle>Allegati</SectionTitle>
        {pdf ? <AttachmentRow icon={FileText} name={pdf.name} onRemove={removePdf} disabled={saving} /> : null}
        {pdf?.fileId && pdf.pageCount > 0 && sequenceSteps.length ? (
          <Button title="Modalità sequenziale disponibile" icon={ListOrdered} disabled={saving} onPress={() => setSequence(true)} />
        ) : null}
        {images.map((image, i) => (
          <AttachmentRow
            key={image.uri}
            icon={ImageIcon}
            name={image.name}
            onRemove={() => setImages((list) => list.filter((_, j) => j !== i))}
            disabled={saving}
          />
        ))}
        <View style={styles.pair}>
          <View style={styles.flex}>
            <Button title={pdf ? 'Cambia referto' : 'PDF / JPG'} icon={FileUp} variant="secondary" busy={pdfBusy} disabled={saving} onPress={() => void choosePdf()} />
          </View>
          <View style={styles.flex}>
            <Button title="Immagini" icon={ImagePlus} variant="secondary" disabled={saving} onPress={chooseImages} />
          </View>
        </View>

        <View style={[styles.separator, { backgroundColor: t.border }]} />

        <ErrorBox message={error} />
        {progress ? <Message>{progress}</Message> : null}
        <View style={styles.pair}>
          <View style={styles.flex}>
            <Button title="Annulla" icon={X} variant="secondary" disabled={saving} onPress={() => router.back()} />
          </View>
          <View style={styles.flex}>
            <Button title="Salva" icon={Save} busy={saving} onPress={() => void save()} />
          </View>
        </View>
      </ScrollView>

      {pdf?.fileId ? (
        <SequenceReader
          visible={sequence}
          steps={sequenceSteps}
          pageCount={pdf.pageCount}
          loadPage={async (page) => (await download(`/files/${encodeURIComponent(pdf.fileId!)}/pages/${page}`)).data}
          onConfirm={confirmStep}
          onClose={(finished) => {
            setSequence(false);
            if (finished) Alert.alert('Compilazione completata', 'Controlla tutti i dati prima di salvare.');
          }}
        />
      ) : null}
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

/** Allegato scelto (PDF o immagine), con il bottone per toglierlo. */
function AttachmentRow({ icon: Icon, name, onRemove, disabled }: { icon: LucideIcon; name: string; onRemove(): void; disabled?: boolean }) {
  const t = useTheme();
  return (
    <View style={[styles.attachment, glassEdge(t), { backgroundColor: t.surface }]}>
      <Icon size={20} color={t.primary} />
      <Text style={{ color: t.text, fontSize: 15, flex: 1 }} numberOfLines={1}>
        {name}
      </Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`Togli ${name}`} onPress={onRemove} disabled={disabled} hitSlop={8}>
        <X size={20} color={t.muted} />
      </Pressable>
    </View>
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
  attachment: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md, borderRadius: radius, borderWidth: 1, alignItems: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  label: { fontSize: 15, fontWeight: '600' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  multiline: { minHeight: 120, paddingTop: spacing.sm, textAlignVertical: 'top' },
  pair: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  separator: { height: StyleSheet.hairlineWidth, marginVertical: spacing.sm },
  ocrButton: { width: 52, height: 52, borderRadius: radius, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  overlayBox: { padding: spacing.lg, borderRadius: radius, alignItems: 'center', gap: spacing.md },
});
