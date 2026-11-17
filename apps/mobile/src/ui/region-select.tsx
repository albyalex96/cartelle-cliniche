import type { ScanRegion } from '@alby/shared';
import { useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import { useTheme } from './theme';

/** Ingrandimento e spostamento di una foto: `scale` ≥ 1, `tx`/`ty` in frazioni del riquadro. */
export interface PhotoView {
  scale: number;
  tx: number;
  ty: number;
}

export const NO_ZOOM: PhotoView = { scale: 1, tx: 0, ty: 0 };
const MAX_SCALE = 6;

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** La foto ingrandita copre sempre tutto il riquadro: lo spostamento resta entro i bordi. */
const fitView = (v: PhotoView): PhotoView => {
  const scale = clamp(v.scale, 1, MAX_SCALE);
  return { scale, tx: clamp(v.tx, 1 - scale, 0), ty: clamp(v.ty, 1 - scale, 0) };
};

/** Ingrandisce (o riduce) la foto di `factor` attorno al centro della zona, che resta fermo. */
export function zoomView(v: PhotoView, factor: number, frame: ScanRegion): PhotoView {
  const scale = clamp(v.scale * factor, 1, MAX_SCALE);
  const k = scale / v.scale;
  const cx = frame.x + frame.width / 2;
  const cy = frame.y + frame.height / 2;
  return fitView({ scale, tx: cx - (cx - v.tx) * k, ty: cy - (cy - v.ty) * k });
}

/** La zona fissa del riquadro, riportata alla foto intera (tenendo conto di ingrandimento e spostamento). */
export const regionInPhoto = (frame: ScanRegion, v: PhotoView): ScanRegion => ({
  x: (frame.x - v.tx) / v.scale,
  y: (frame.y - v.ty) / v.scale,
  width: frame.width / v.scale,
  height: frame.height / v.scale,
});

// Posizioni delle dita relative al riquadro: lo strato che riceve i tocchi lo copre esattamente.
type Touch = { locationX: number; locationY: number };
const distance = (a: Touch, b: Touch) => Math.hypot(a.locationX - b.locationX, a.locationY - b.locationY);
const middle = (a: Touch, b: Touch): Touch => ({ locationX: (a.locationX + b.locationX) / 2, locationY: (a.locationY + b.locationY) / 2 });

/**
 * Riquadro con proporzioni fisse (`aspect` = larghezza/altezza, come la foto) con la zona fissa da leggere
 * (`frame`); fuori dalla zona l'immagine è scurita. Con due dita si avvicina:
 *  - fotocamera (`zoom`/`onZoom`): cambia lo zoom della fotocamera (0–1); la foto scattata è come l'anteprima;
 *  - foto (`view`/`onView`): la foto si ingrandisce e, con un dito, si sposta sotto la zona.
 * `children` riceve la posizione della foto nel riquadro (ingrandimento e spostamento compresi).
 */
export function RegionSelect({
  aspect,
  frame,
  zoom,
  onZoom,
  view,
  onView,
  children,
}: {
  aspect: number;
  frame: ScanRegion;
  zoom?: number;
  onZoom?(zoom: number): void;
  view?: PhotoView;
  onView?(view: PhotoView): void;
  children: (photo: { width: number; height: number; left: number; top: number }) => ReactNode;
}) {
  const t = useTheme();
  const [space, setSpace] = useState({ width: 0, height: 0 });
  // Il riquadro più grande con le proporzioni della foto che sta nello spazio disponibile.
  const width = Math.min(space.width, space.height * aspect);
  const height = width / aspect;
  const v = view ?? NO_ZOOM;

  // Ref, non stato: i gestori dei tocchi devono vedere sempre i valori correnti.
  const current = useRef({ width, height, zoom: zoom ?? 0, view: v, onZoom, onView });
  current.current = { width, height, zoom: zoom ?? 0, view: v, onZoom, onView };
  const gesture = useRef<{
    pinch: { d0: number; zoom0: number; view0: PhotoView; mid0: Touch } | null;
    pan: { start: Touch; view0: PhotoView } | null;
  }>({ pinch: null, pan: null });

  function start(e: GestureResponderEvent) {
    const touches = e.nativeEvent.touches;
    const c = current.current;
    if (touches.length >= 2) {
      gesture.current = {
        pinch: { d0: distance(touches[0]!, touches[1]!), zoom0: c.zoom, view0: c.view, mid0: middle(touches[0]!, touches[1]!) },
        pan: null,
      };
    } else if (touches.length === 1) {
      gesture.current = { pinch: null, pan: { start: touches[0]!, view0: c.view } };
    }
  }

  function move(e: GestureResponderEvent) {
    const touches = e.nativeEvent.touches;
    const c = current.current;
    const g = gesture.current;
    if (!c.width) return;
    if (touches.length >= 2) {
      // Secondo dito appoggiato dopo il primo: da qui parte il pinch.
      if (!g.pinch) return start(e);
      const ratio = distance(touches[0]!, touches[1]!) / Math.max(1, g.pinch.d0);
      c.onZoom?.(clamp(g.pinch.zoom0 + (ratio - 1) * 0.5, 0, 1));
      if (c.onView) {
        // Si ingrandisce attorno al punto tra le dita, che segue le dita.
        const { view0, mid0 } = g.pinch;
        const scale = clamp(view0.scale * ratio, 1, MAX_SCALE);
        const k = scale / view0.scale;
        const mx = mid0.locationX / c.width;
        const my = mid0.locationY / c.height;
        const mid = middle(touches[0]!, touches[1]!);
        c.onView(
          fitView({
            scale,
            tx: mx - (mx - view0.tx) * k + (mid.locationX - mid0.locationX) / c.width,
            ty: my - (my - view0.ty) * k + (mid.locationY - mid0.locationY) / c.height,
          }),
        );
      }
      return;
    }
    if (touches.length !== 1) return;
    // Sollevato un dito del pinch: si continua spostando con quello rimasto.
    if (!g.pan) return start(e);
    if (!c.onView) return;
    const { start: s, view0 } = g.pan;
    c.onView(
      fitView({
        ...view0,
        tx: view0.tx + (touches[0]!.locationX - s.locationX) / c.width,
        ty: view0.ty + (touches[0]!.locationY - s.locationY) / c.height,
      }),
    );
  }

  const end = () => {
    gesture.current = { pinch: null, pan: null };
  };

  const photo = { width: width * v.scale, height: height * v.scale, left: width * v.tx, top: height * v.ty };

  return (
    <View style={styles.space} onLayout={(e: LayoutChangeEvent) => setSpace(e.nativeEvent.layout)}>
      {width > 0 ? (
        <View style={{ width, height, overflow: 'hidden' }}>
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            {children(photo)}
          </View>
          {/* Fuori dalla zona l'immagine è scurita: si vede bene cosa verrà letto. */}
          <View pointerEvents="none" style={[styles.shade, { left: 0, top: 0, right: 0, height: frame.y * height }]} />
          <View pointerEvents="none" style={[styles.shade, { left: 0, right: 0, bottom: 0, height: (1 - frame.y - frame.height) * height }]} />
          <View pointerEvents="none" style={[styles.shade, { left: 0, top: frame.y * height, width: frame.x * width, height: frame.height * height }]} />
          <View
            pointerEvents="none"
            style={[styles.shade, { right: 0, top: frame.y * height, width: (1 - frame.x - frame.width) * width, height: frame.height * height }]}
          />
          <View
            pointerEvents="none"
            style={[
              styles.zone,
              { borderColor: t.primary, left: frame.x * width, top: frame.y * height, width: frame.width * width, height: frame.height * height },
            ]}
          />
          {/* Sopra a tutto: riceve i tocchi (uno o due dita), con coordinate relative al riquadro. */}
          <View
            style={StyleSheet.absoluteFill}
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
            onResponderTerminationRequest={() => false}
            onResponderGrant={start}
            onResponderMove={move}
            onResponderRelease={end}
            onResponderTerminate={end}
          />
        </View>
      ) : null}
    </View>
  );
}

/** Zona fissa: una striscia per un campo breve, metà pagina per un testo o una tabella. */
export const defaultRegion = (mode: 'table' | 'date' | 'line' | 'paragraph'): ScanRegion =>
  mode === 'line' || mode === 'date' ? { x: 0.05, y: 0.42, width: 0.9, height: 0.12 } : { x: 0.05, y: 0.2, width: 0.9, height: 0.55 };

const styles = StyleSheet.create({
  space: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  shade: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.45)' },
  zone: { position: 'absolute', borderWidth: 3, borderRadius: 4 },
});
