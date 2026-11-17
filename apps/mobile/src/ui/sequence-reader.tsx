import type { ReportDraftDTO } from '@alby/shared';
import type { File } from 'expo-file-system';
import { Check, ChevronLeft, ChevronRight, Pencil, ScanText, SkipForward, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { readZone, recognizePhoto, type PhotoText, type ZoneMode } from '@/lib/device-ocr';
import { formatDate } from '@/lib/format';
import { parseDateInput } from '@/lib/new-report';
import { deleteTempDocument, writeTempDocument } from '@/lib/temp-documents';
import { Button } from './controls';
import { defaultRegion, MAX_SCALE, NO_ZOOM, RegionSelect, regionInPhoto, ZoomControls, zoomView, type PhotoView } from './region-select';
import { radius, spacing, useTheme } from './theme';

type Rows = ReportDraftDTO['values']['results'];

/** Un campo della sequenza: chiave nel form, etichetta e come leggerlo. */
export interface SequenceStep {
  key: string;
  label: string;
  mode: ZoneMode;
}

/** Valore confermato per un campo: testo (per le date AAAA-MM-GG) o righe della tabella dei valori. */
export type SequenceValue = { kind: 'text'; text: string } | { kind: 'rows'; rows: Rows };

/** Pagina del PDF scaricata come immagine e letta (una volta sola) con il riconoscimento del testo. */
interface LoadedPage {
  file: File;
  width: number;
  height: number;
  text: PhotoText;
}

/**
 * Compilazione sequenziale da un PDF, campo per campo come nella webapp: la pagina del PDF con la zona fissa
 * (zoom con due dita o con i bottoni), sotto l'anteprima del campo. "Leggi" legge la zona; poi con la spunta
 * si conferma (e si passa al campo successivo), con la matita si corregge; "Salta" passa oltre.
 * Le pagine arrivano dal server come immagini; il testo si riconosce sul telefono.
 */
export function SequenceReader({
  visible,
  steps,
  pageCount,
  loadPage,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  steps: SequenceStep[];
  pageCount: number;
  /** Immagine JPEG della pagina (numerata da 1). */
  loadPage(page: number): Promise<Uint8Array>;
  onConfirm(step: SequenceStep, value: SequenceValue): void;
  /** `finished`: si è arrivati in fondo alla sequenza. */
  onClose(finished: boolean): void;
}) {
  const t = useTheme();
  const [index, setIndex] = useState(0);
  const [page, setPage] = useState(1);
  const [view, setView] = useState<PhotoView>(NO_ZOOM);
  const [loaded, setLoaded] = useState<LoadedPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [result, setResult] = useState<SequenceValue | null>(null);
  const [empty, setEmpty] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  // Pagine già scaricate e lette, per non ripetere il lavoro passando da un campo all'altro.
  const pages = useRef(new Map<number, LoadedPage>());

  const step = steps[index];
  const frame = defaultRegion(step?.mode ?? 'line');

  // All'apertura si riparte dal primo campo; alla chiusura si cancellano le immagini delle pagine.
  useEffect(() => {
    if (!visible) return;
    setIndex(0);
    setPage(1);
    resetStep();
    const cache = pages.current;
    return () => {
      for (const p of cache.values()) deleteTempDocument(p.file);
      cache.clear();
      setLoaded(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let current = true;
    const cached = pages.current.get(page);
    if (cached) {
      setLoaded(cached);
      return;
    }
    setLoaded(null);
    setLoading(true);
    setLoadError(null);
    (async () => {
      const file = writeTempDocument(await loadPage(page), 'jpg');
      const { width, height } = await Image.getSize(file.uri);
      const text = await recognizePhoto(file.uri, width, height);
      const entry = { file, width, height, text };
      pages.current.set(page, entry);
      if (current) setLoaded(entry);
    })()
      .catch(() => current && setLoadError('Pagina non disponibile: controlla la connessione e riprova.'))
      .finally(() => current && setLoading(false));
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, page]);

  function resetStep() {
    setResult(null);
    setEmpty(false);
    setEditing(false);
    setView(NO_ZOOM);
  }

  function next() {
    resetStep();
    if (index + 1 >= steps.length) onClose(true);
    else setIndex(index + 1);
  }

  function read() {
    if (!loaded || !step) return;
    const region = regionInPhoto(frame, view);
    setEditing(false);
    if (step.mode === 'table') {
      const rows = readZone(loaded.text, region, 'table');
      setResult(rows.length ? { kind: 'rows', rows } : null);
      setEmpty(!rows.length);
      return;
    }
    const text = readZone(loaded.text, region, step.mode);
    setResult(text ? { kind: 'text', text } : null);
    setEmpty(!text);
  }

  function startEdit() {
    if (result?.kind !== 'text' || !step) return;
    setDraft(step.mode === 'date' ? formatDate(result.text) : result.text);
    setEditing(true);
  }

  function confirm() {
    if (!step || !result) return;
    if (editing && result.kind === 'text') {
      const text = step.mode === 'date' ? (parseDateInput(draft) ?? '') : draft.trim();
      if (step.mode === 'date' && !text) return;
      onConfirm(step, { kind: 'text', text });
    } else {
      onConfirm(step, result);
    }
    next();
  }

  const shown = (r: SequenceValue) =>
    r.kind === 'rows'
      ? r.rows.map((row) => [row.name, [row.value, row.unit].filter(Boolean).join(' '), row.referenceRange && `(${row.referenceRange})`].filter(Boolean).join('  ')).join('\n')
      : step?.mode === 'date'
        ? formatDate(r.text)
        : r.text;

  const dateInvalid = editing && step?.mode === 'date' && !parseDateInput(draft);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={() => onClose(false)} statusBarTranslucent>
      <SafeAreaView style={[styles.flex, { backgroundColor: '#000' }]}>
        <View style={styles.header}>
          <View style={styles.flex}>
            <Text style={styles.stepCount}>
              Campo {index + 1} di {steps.length}
            </Text>
            <Text style={styles.stepLabel} numberOfLines={1}>
              {step?.label}
            </Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Chiudi la compilazione sequenziale" onPress={() => onClose(false)} hitSlop={10}>
            <X size={26} color="#fff" />
          </Pressable>
        </View>

        {pageCount > 1 ? (
          <View style={styles.pager}>
            <Pressable accessibilityRole="button" accessibilityLabel="Pagina precedente" disabled={page <= 1} onPress={() => setPage(page - 1)} hitSlop={10}>
              <ChevronLeft size={26} color={page <= 1 ? '#666' : '#fff'} />
            </Pressable>
            <Text style={styles.pageText}>
              Pagina {page} di {pageCount}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Pagina successiva" disabled={page >= pageCount} onPress={() => setPage(page + 1)} hitSlop={10}>
              <ChevronRight size={26} color={page >= pageCount ? '#666' : '#fff'} />
            </Pressable>
          </View>
        ) : null}

        <View style={styles.flex}>
          {loaded ? (
            <RegionSelect aspect={loaded.width / loaded.height} frame={frame} view={view} onView={setView}>
              {(pos) => <Image source={{ uri: loaded.file.uri }} style={{ position: 'absolute', ...pos }} resizeMode="stretch" />}
            </RegionSelect>
          ) : (
            <View style={[styles.flex, styles.center]}>
              {loading ? <ActivityIndicator size="large" color="#fff" /> : null}
              <Text style={styles.hint}>{loadError ?? 'Preparazione della pagina…'}</Text>
            </View>
          )}
        </View>
        <ZoomControls
          onIn={() => setView(zoomView(view, 1.4, frame))}
          onOut={() => setView(zoomView(view, 1 / 1.4, frame))}
          onReset={() => setView(NO_ZOOM)}
          zoomed={view.scale > 1}
          canZoomIn={view.scale < MAX_SCALE}
        />

        <View style={[styles.preview, { backgroundColor: t.surface }]}>
          <Text style={[styles.previewTitle, { color: t.muted }]}>Anteprima compilazione</Text>
          <View style={[styles.previewBox, { borderColor: t.border, backgroundColor: t.background }]}>
            <ScrollView style={styles.previewScroll} contentContainerStyle={{ padding: spacing.sm }}>
              {editing ? (
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  autoFocus
                  multiline={step?.mode === 'paragraph' || step?.mode === 'line'}
                  placeholder={step?.mode === 'date' ? 'GG/MM/AAAA' : undefined}
                  placeholderTextColor={t.muted}
                  accessibilityLabel={step?.label}
                  style={[styles.previewText, { color: t.text, padding: 0 }]}
                />
              ) : (
                <Text style={[styles.previewText, { color: result ? t.text : t.muted }]}>
                  {result ? shown(result) : empty ? 'Nella zona non ho trovato niente da inserire: sposta o ingrandisci la pagina e rileggi.' : 'Porta il testo nel riquadro e premi “Leggi”.'}
                </Text>
              )}
            </ScrollView>
            {result ? (
              <View style={styles.previewIcons}>
                {result.kind === 'text' && !editing ? (
                  <Pressable accessibilityRole="button" accessibilityLabel="Modifica" onPress={startEdit} hitSlop={8} style={[styles.icon, { backgroundColor: t.primarySurface }]}>
                    <Pencil size={18} color={t.primary} />
                  </Pressable>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Conferma e passa al campo successivo"
                  onPress={confirm}
                  disabled={dateInvalid}
                  hitSlop={8}
                  style={[styles.icon, { backgroundColor: t.primary, opacity: dateInvalid ? 0.4 : 1 }]}
                >
                  <Check size={18} color={t.onPrimary} />
                </Pressable>
              </View>
            ) : null}
          </View>

          <View style={styles.row}>
            <View style={styles.flex}>
              <Button title="Salta" icon={SkipForward} variant="secondary" onPress={next} />
            </View>
            <View style={styles.flex}>
              <Button title={result ? 'Rileggi' : 'Leggi'} icon={ScanText} disabled={!loaded} onPress={read} />
            </View>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingTop: spacing.md },
  stepCount: { color: '#bbb', fontSize: 13 },
  stepLabel: { color: '#fff', fontSize: 18, fontWeight: '600' },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.lg, paddingVertical: spacing.sm },
  pageText: { color: '#fff', fontSize: 15 },
  hint: { color: '#fff', fontSize: 15, textAlign: 'center' },
  preview: { padding: spacing.md, gap: spacing.sm, borderTopLeftRadius: radius * 1.5, borderTopRightRadius: radius * 1.5, marginTop: spacing.md },
  previewTitle: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  previewBox: { flexDirection: 'row', alignItems: 'flex-end', borderWidth: 1, borderRadius: radius, minHeight: 56 },
  previewScroll: { flex: 1, maxHeight: 140 },
  previewText: { fontSize: 16, lineHeight: 22, flexShrink: 1 },
  previewIcons: { flexDirection: 'row', gap: spacing.sm, padding: spacing.sm },
  icon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', gap: spacing.sm },
});
