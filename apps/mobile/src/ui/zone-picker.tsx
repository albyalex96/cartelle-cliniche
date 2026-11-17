import type { ScanRegion } from '@alby/shared';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Camera, Images, ScanText } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Image, Modal, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from './controls';
import { defaultRegion, RegionSelect } from './region-select';
import { spacing } from './theme';

export interface PickedPhoto {
  uri: string;
  width: number;
  height: number;
}

/** Anteprima e foto della fotocamera in verticale, 3:4: la zona sull'anteprima corrisponde alla foto. */
const CAMERA_ASPECT = 3 / 4;

/**
 * Lettura di un campo da una foto del referto: si inquadra il referto con la fotocamera, si trascina il
 * riquadro sul testo da leggere e si scatta. In alternativa si usa la foto già scattata o una della galleria.
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
  const [region, setRegion] = useState<ScanRegion>(defaultRegion('line'));
  // Foto su cui scegliere la zona; null = fotocamera dal vivo.
  const [still, setStill] = useState<{ photo: PickedPhoto; isNew: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  // A ogni apertura: zona adatta al campo, e la fotocamera (o la foto già fatta, se il permesso manca).
  useEffect(() => {
    if (!target) return;
    setRegion(defaultRegion(target.mode));
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
      onDone({ photo: { uri: shot.uri, width: shot.width, height: shot.height }, isNew: true, region });
    } catch {
      setBusy(false);
    }
  }

  async function fromGallery() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    const asset = res.canceled ? null : res.assets[0];
    if (asset) setStill({ photo: { uri: asset.uri, width: asset.width, height: asset.height }, isNew: true });
  }

  const cameraReady = !!permission?.granted;
  const showCamera = !still && cameraReady;

  return (
    <Modal visible={!!target} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <GestureHandlerRootView style={styles.flex}>
        <SafeAreaView style={[styles.flex, { backgroundColor: '#000' }]}>
          <Text style={styles.hint}>
            {showCamera
              ? `Inquadra il referto e sposta il riquadro su: ${target?.label ?? ''}. Poi scatta.`
              : `Trascina il riquadro su: ${target?.label ?? ''}.`}
          </Text>

          {still ? (
            <RegionSelect aspect={still.photo.width / still.photo.height} region={region} onChange={setRegion}>
              <Image source={{ uri: still.photo.uri }} style={StyleSheet.absoluteFill} resizeMode="stretch" />
            </RegionSelect>
          ) : showCamera ? (
            <RegionSelect aspect={CAMERA_ASPECT} region={region} onChange={setRegion}>
              <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" ratio="4:3" animateShutter={false} />
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

          <View style={styles.actions}>
            {still ? (
              <Button title="Leggi la zona" icon={ScanText} onPress={() => onDone({ ...still, region })} />
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
                  <Button title="Foto già fatta" variant="secondary" onPress={() => setStill({ photo, isNew: false })} />
                </View>
              ) : null}
              <View style={styles.flex}>
                <Button title="Galleria" icon={Images} variant="secondary" onPress={() => void fromGallery()} />
              </View>
            </View>
            <Button title="Annulla" variant="secondary" onPress={onClose} />
          </View>
        </SafeAreaView>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.lg },
  hint: { color: '#fff', fontSize: 15, padding: spacing.md, textAlign: 'center' },
  actions: { padding: spacing.md, gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
});
