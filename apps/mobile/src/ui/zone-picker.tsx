import type { ScanRegion } from '@alby/shared';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Camera, Images, RotateCcw, ScanText, ZoomIn, ZoomOut, type LucideIcon } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from './controls';
import { defaultRegion, NO_ZOOM, RegionSelect, regionInPhoto, zoomView, type PhotoView } from './region-select';
import { spacing } from './theme';

export interface PickedPhoto {
  uri: string;
  width: number;
  height: number;
}

/** Anteprima e foto della fotocamera in verticale, 3:4: la zona sull'anteprima corrisponde alla foto. */
const CAMERA_ASPECT = 3 / 4;

/**
 * Lettura di un campo da una foto del referto: si inquadra il testo nel riquadro fisso (avvicinandolo
 * con due dita) e si scatta. In alternativa si usa la foto già scattata o una della galleria.
 * Restituisce la foto (`isNew` se appena scattata o scelta) e la zona, in frazioni della foto (0–1).
 */
export function ZonePicker({
  target,
  photo,
  onDone,
  onClose,
}: {
  /** Il campo da leggere; `null` = chiuso. */
  target: { label: string; mode: 'table' | 'date' | 'line' | 'paragraph' } | null;
  /** Foto già scattata per questo referto, se c'è. */
  photo: PickedPhoto | null;
  onDone(result: { photo: PickedPhoto; isNew: boolean; region: ScanRegion }): void;
  onClose(): void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  // Zona fissa (dipende dal tipo di campo); si avvicina il testo con il pinch.
  const [frame, setFrame] = useState<ScanRegion>(defaultRegion('line'));
  const [zoom, setZoom] = useState(0);
  const [view, setView] = useState<PhotoView>(NO_ZOOM);
  // Foto su cui scegliere la zona; null = fotocamera dal vivo.
  const [still, setStill] = useState<{ photo: PickedPhoto; isNew: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  // A ogni apertura: zona adatta al campo, e la fotocamera (o la foto già fatta, se il permesso manca).
  useEffect(() => {
    if (!target) return;
    setFrame(defaultRegion(target.mode));
    setZoom(0);
    setView(NO_ZOOM);
    setStill(null);
    setBusy(false);
    if (permission && !permission.granted && permission.canAskAgain) void requestPermission();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  async function shoot() {
    if (!camera.current) return;
    setBusy(true);
    try {
      const shot = await camera.current.takePictureAsync({ quality: 0.9 });
      // La foto è scattata con lo stesso zoom dell'anteprima: la zona fissa corrisponde.
      onDone({ photo: { uri: shot.uri, width: shot.width, height: shot.height }, isNew: true, region: frame });
    } catch {
      setBusy(false);
    }
  }

  async function fromGallery() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    const asset = res.canceled ? null : res.assets[0];
    if (!asset) return;
    setView(NO_ZOOM);
    setStill({ photo: { uri: asset.uri, width: asset.width, height: asset.height }, isNew: true });
  }

  const cameraReady = !!permission?.granted;
  const showCamera = !still && cameraReady;

  // Bottoni dello zoom: sulla fotocamera a passi di un decimo, sulla foto del 40% attorno alla zona.
  const zoomed = still ? view.scale > 1 : zoom > 0;
  const zoomIn = () => (still ? setView(zoomView(view, 1.4, frame)) : setZoom((z) => Math.min(1, z + 0.1)));
  const zoomOut = () => (still ? setView(zoomView(view, 1 / 1.4, frame)) : setZoom((z) => Math.max(0, z - 0.1)));
  const resetZoom = () => (still ? setView(NO_ZOOM) : setZoom(0));

  return (
    <Modal visible={!!target} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.flex}>
        <SafeAreaView style={[styles.flex, { backgroundColor: '#000' }]}>
          <Text style={styles.hint}>
            {showCamera
              ? `Inquadra ${target?.label ?? ''} nel riquadro (due dita per avvicinare), poi scatta.`
              : `Porta ${target?.label ?? ''} nel riquadro: due dita per ingrandire, un dito per spostare.`}
          </Text>

          {still ? (
            <RegionSelect aspect={still.photo.width / still.photo.height} frame={frame} view={view} onView={setView}>
              {(pos) => <Image source={{ uri: still.photo.uri }} style={{ position: 'absolute', ...pos }} resizeMode="stretch" />}
            </RegionSelect>
          ) : showCamera ? (
            <RegionSelect aspect={CAMERA_ASPECT} frame={frame} zoom={zoom} onZoom={setZoom}>
              {() => <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" ratio="4:3" zoom={zoom} animateShutter={false} />}
            </RegionSelect>
          ) : (
            <View style={[styles.flex, styles.center]}>
              <Text style={styles.hint}>
                {permission && !permission.canAskAgain
                  ? 'Per inquadrare il referto consenti l’uso della fotocamera nelle impostazioni del telefono.'
                  : 'Serve il permesso di usare la fotocamera.'}
              </Text>
              {permission?.canAskAgain ? <Button title="Consenti la fotocamera" icon={Camera} onPress={() => void requestPermission()} /> : null}
            </View>
          )}

          {still || showCamera ? (
            <View style={styles.zoomRow}>
              <RoundButton icon={ZoomOut} label="Riduci lo zoom" onPress={zoomOut} disabled={!zoomed} />
              <RoundButton icon={RotateCcw} label="Annulla lo zoom" onPress={resetZoom} disabled={!zoomed} />
              <RoundButton icon={ZoomIn} label="Aumenta lo zoom" onPress={zoomIn} disabled={still ? view.scale >= 6 : zoom >= 1} />
            </View>
          ) : null}

          <View style={styles.actions}>
            {still ? (
              <Button title="Leggi la zona" icon={ScanText} onPress={() => onDone({ ...still, region: regionInPhoto(frame, view) })} />
            ) : showCamera ? (
              <Button title="Scatta e leggi" icon={Camera} busy={busy} onPress={() => void shoot()} />
            ) : null}
            <View style={styles.row}>
              {still && cameraReady ? (
                <View style={styles.flex}>
                  <Button title="Fotocamera" icon={Camera} variant="secondary" onPress={() => setStill(null)} />
                </View>
              ) : null}
              {photo && !(still && !still.isNew) ? (
                <View style={styles.flex}>
                  <Button
                    title="Foto già fatta"
                    variant="secondary"
                    onPress={() => {
                      setView(NO_ZOOM);
                      setStill({ photo, isNew: false });
                    }}
                  />
                </View>
              ) : null}
              <View style={styles.flex}>
                <Button title="Galleria" icon={Images} variant="secondary" onPress={() => void fromGallery()} />
              </View>
            </View>
            <Button title="Annulla" variant="secondary" onPress={onClose} />
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

/** Bottone tondo con la sola icona (sopra la fotocamera, su sfondo scuro). */
function RoundButton({ icon: Icon, label, onPress, disabled }: { icon: LucideIcon; label: string; onPress(): void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.round, (pressed || disabled) && { opacity: disabled ? 0.35 : 0.6 }]}
    >
      <Icon size={26} color="#fff" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  zoomRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.lg, paddingTop: spacing.md },
  round: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.lg },
  hint: { color: '#fff', fontSize: 15, padding: spacing.md, textAlign: 'center' },
  actions: { padding: spacing.md, gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
});
