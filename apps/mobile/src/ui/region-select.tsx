import type { ScanRegion } from '@alby/shared';
import { useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useTheme } from './theme';

/** Zona minima: il 3% del riquadro in ciascuna direzione. */
const MIN_SIZE = 0.03;

const clamp = (n: number) => Math.min(1, Math.max(0, n));

/**
 * Riquadro con proporzioni fisse (`aspect` = larghezza/altezza, come la foto) su cui si disegna la zona
 * da leggere: trascinando fuori dalla zona se ne disegna una nuova, trascinando dentro la si sposta.
 * Sotto, `children` (la foto o l'anteprima della fotocamera) riempie il riquadro.
 * Le coordinate del tocco arrivano da gesture-handler, sempre relative al riquadro.
 */
export function RegionSelect({
  aspect,
  region,
  onChange,
  children,
}: {
  aspect: number;
  region: ScanRegion;
  onChange(region: ScanRegion): void;
  children: ReactNode;
}) {
  const t = useTheme();
  const [space, setSpace] = useState({ width: 0, height: 0 });
  // Il riquadro più grande con le proporzioni della foto che sta nello spazio disponibile.
  const width = Math.min(space.width, space.height * aspect);
  const height = width / aspect;
  // Ref, non stato: i callback del gesto devono vedere sempre i valori correnti.
  const drag = useRef<{ mode: 'draw' | 'move'; x0: number; y0: number; start: ScanRegion } | null>(null);
  const current = useRef({ region, width, height, onChange });
  current.current = { region, width, height, onChange };

  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .onBegin((e) => {
      const { region: r, width: w, height: h } = current.current;
      if (!w) return;
      const x = clamp(e.x / w);
      const y = clamp(e.y / h);
      const inside = x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;
      drag.current = { mode: inside ? 'move' : 'draw', x0: x, y0: y, start: r };
    })
    .onUpdate((e) => {
      const d = drag.current;
      const { width: w, height: h, onChange: change } = current.current;
      if (!d || !w) return;
      const x = clamp(e.x / w);
      const y = clamp(e.y / h);
      if (d.mode === 'move') {
        const { start } = d;
        change({
          ...start,
          x: Math.min(1 - start.width, Math.max(0, start.x + x - d.x0)),
          y: Math.min(1 - start.height, Math.max(0, start.y + y - d.y0)),
        });
      } else {
        const next = { x: Math.min(d.x0, x), y: Math.min(d.y0, y), width: Math.abs(x - d.x0), height: Math.abs(y - d.y0) };
        // Finché è troppo piccola resta la zona di prima (un tocco non la cancella).
        if (next.width >= MIN_SIZE && next.height >= MIN_SIZE) change(next);
      }
    })
    .onFinalize(() => {
      drag.current = null;
    });

  return (
    <View style={styles.space} onLayout={(e: LayoutChangeEvent) => setSpace(e.nativeEvent.layout)}>
      {width > 0 ? (
        <GestureDetector gesture={pan}>
          <View style={{ width, height, overflow: 'hidden' }} collapsable={false}>
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              {children}
            </View>
            {/* Fuori dalla zona l'immagine è scurita: si vede bene cosa verrà letto. */}
            <View pointerEvents="none" style={[styles.shade, { left: 0, top: 0, right: 0, height: region.y * height }]} />
            <View pointerEvents="none" style={[styles.shade, { left: 0, right: 0, bottom: 0, height: (1 - region.y - region.height) * height }]} />
            <View
              pointerEvents="none"
              style={[styles.shade, { left: 0, top: region.y * height, width: region.x * width, height: region.height * height }]}
            />
            <View
              pointerEvents="none"
              style={[
                styles.shade,
                { right: 0, top: region.y * height, width: (1 - region.x - region.width) * width, height: region.height * height },
              ]}
            />
            <View
              pointerEvents="none"
              style={[
                styles.zone,
                {
                  borderColor: t.primary,
                  left: region.x * width,
                  top: region.y * height,
                  width: region.width * width,
                  height: region.height * height,
                },
              ]}
            />
          </View>
        </GestureDetector>
      ) : null}
    </View>
  );
}

/** Zona proposta all'apertura: una striscia per un campo breve, metà pagina per un testo o una tabella. */
export const defaultRegion = (mode: 'table' | 'date' | 'line' | 'paragraph'): ScanRegion =>
  mode === 'line' || mode === 'date' ? { x: 0.05, y: 0.42, width: 0.9, height: 0.12 } : { x: 0.05, y: 0.2, width: 0.9, height: 0.55 };

const styles = StyleSheet.create({
  space: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  shade: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.45)' },
  zone: { position: 'absolute', borderWidth: 3, borderRadius: 4 },
});
