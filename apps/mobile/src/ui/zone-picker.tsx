import type { ScanRegion } from '@alby/shared';
import { useMemo, useRef, useState } from 'react';
import { Image, Modal, PanResponder, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from './controls';
import { spacing, useTheme } from './theme';

/** Zona minima: l'1% della foto in ciascuna direzione (un tocco senza trascinare non basta). */
const MIN_SIZE = 0.01;

/**
 * Foto a schermo intero su cui si trascina un rettangolo: la zona da leggere per il campo `label`.
 * Restituisce la zona in frazioni della foto (0–1), come le zone delle scansioni sul web.
 */
export function ZonePicker({
  photo,
  label,
  onPick,
  onClose,
}: {
  photo: { uri: string; width: number; height: number } | null;
  label: string;
  onPick(region: ScanRegion): void;
  onClose(): void;
}) {
  const t = useTheme();
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [zone, setZone] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const boxRef = useRef(box);
  boxRef.current = box;

  // Area occupata dalla foto dentro il riquadro (adattata senza tagliarla).
  const frame = useMemo(() => {
    if (!photo || !box.width || !box.height) return null;
    const scale = Math.min(box.width / photo.width, box.height / photo.height);
    const width = photo.width * scale;
    const height = photo.height * scale;
    return { left: (box.width - width) / 2, top: (box.height - height) / 2, width, height };
  }, [photo, box]);
  const frameRef = useRef(frame);
  frameRef.current = frame;

  const responder = useMemo(() => {
    const toFraction = (px: number, py: number) => {
      const f = frameRef.current!;
      return { x: Math.min(1, Math.max(0, (px - f.left) / f.width)), y: Math.min(1, Math.max(0, (py - f.top) / f.height)) };
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => !!frameRef.current,
      onMoveShouldSetPanResponder: () => !!frameRef.current,
      onPanResponderGrant: (e) => {
        const p = toFraction(e.nativeEvent.locationX, e.nativeEvent.locationY);
        setZone({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
      },
      onPanResponderMove: (_e, g) => {
        setZone((z) => {
          if (!z) return z;
          const f = frameRef.current!;
          const start = { x: f.left + z.x0 * f.width, y: f.top + z.y0 * f.height };
          const p = toFraction(start.x + g.dx, start.y + g.dy);
          return { ...z, x1: p.x, y1: p.y };
        });
      },
    });
  }, []);

  const region: ScanRegion | null = zone
    ? { x: Math.min(zone.x0, zone.x1), y: Math.min(zone.y0, zone.y1), width: Math.abs(zone.x1 - zone.x0), height: Math.abs(zone.y1 - zone.y0) }
    : null;
  const valid = !!region && region.width >= MIN_SIZE && region.height >= MIN_SIZE;

  const close = () => {
    setZone(null);
    onClose();
  };

  return (
    <Modal visible={!!photo} animationType="slide" onRequestClose={close}>
      <SafeAreaView style={[styles.root, { backgroundColor: '#000' }]}>
        <Text style={styles.hint}>Trascina sulla foto per scegliere la zona da leggere: {label}</Text>
        <View style={styles.box} onLayout={(e: LayoutChangeEvent) => setBox(e.nativeEvent.layout)} {...responder.panHandlers}>
          {photo && frame ? (
            // Il tocco deve arrivare al riquadro (coordinate rispetto a lui), non alla foto.
            <View pointerEvents="none" style={{ position: 'absolute', ...frame }}>
              <Image source={{ uri: photo.uri }} style={StyleSheet.absoluteFill} resizeMode="contain" accessibilityIgnoresInvertColors />
            </View>
          ) : null}
          {frame && region ? (
            <View
              pointerEvents="none"
              style={[
                styles.zone,
                {
                  borderColor: t.primary,
                  left: frame.left + region.x * frame.width,
                  top: frame.top + region.y * frame.height,
                  width: region.width * frame.width,
                  height: region.height * frame.height,
                },
              ]}
            />
          ) : null}
        </View>
        <View style={styles.actions}>
          <Button
            title="Leggi la zona"
            disabled={!valid}
            onPress={() => {
              if (!region) return;
              setZone(null);
              onPick(region);
            }}
          />
          <Button title="Annulla" variant="secondary" onPress={close} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hint: { color: '#fff', fontSize: 15, padding: spacing.md, textAlign: 'center' },
  box: { flex: 1 },
  zone: { position: 'absolute', borderWidth: 2, backgroundColor: 'rgba(31,111,235,0.18)' },
  actions: { padding: spacing.md, gap: spacing.sm },
});
