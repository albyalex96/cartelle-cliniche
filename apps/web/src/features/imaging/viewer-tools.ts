import type { ImagingGeometryDTO } from '@alby/shared';

/**
 * Strumenti del visualizzatore di immagini: tipi e calcoli (zoom, misure).
 * File neutro: nessun accesso al browser, così resta facile da verificare.
 */

/** Cosa fa il trascinamento sull'immagine. */
export type Tool = 'pan' | 'measure' | 'adjust';

/** Come è mostrata un'immagine in un riquadro. */
export interface View {
  zoom: number;
  /** Spostamento dal centro, in pixel dello schermo. */
  x: number;
  y: number;
  brightness: number;
  contrast: number;
  invert: boolean;
  /** Rotazione in senso orario, in gradi (multipli di 90). */
  rotation: number;
  /** Specchiata in orizzontale (prima della rotazione). */
  flip: boolean;
}

export const DEFAULT_VIEW: View = { zoom: 1, x: 0, y: 0, brightness: 1, contrast: 1, invert: false, rotation: 0, flip: false };
export const ZOOM_MAX = 8;

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * Ingrandisce o riduce tenendo fermo il punto `at` (in pixel dal centro del riquadro):
 * di solito la posizione del puntatore.
 */
export function zoomBy(view: View, factor: number, at: { x: number; y: number } = { x: 0, y: 0 }): View {
  const zoom = clamp(view.zoom * factor, 1, ZOOM_MAX);
  if (zoom === 1) return { ...view, zoom, x: 0, y: 0 };
  const k = zoom / view.zoom;
  return { ...view, zoom, x: at.x - (at.x - view.x) * k, y: at.y - (at.y - view.y) * k };
}

/** Ruota di un quarto di giro (in senso orario se `by` è positivo). */
export const rotateBy = (view: View, by: 1 | -1): View => ({ ...view, rotation: (((view.rotation + by * 90) % 360) + 360) % 360 });

/** Ruota un vettore di `degrees` in senso orario sullo schermo (asse y verso il basso), come `rotate()` dei CSS. */
export function rotateVector(v: { x: number; y: number }, degrees: number) {
  const r = (degrees * Math.PI) / 180;
  const cos = Math.round(Math.cos(r) * 1e9) / 1e9;
  const sin = Math.round(Math.sin(r) * 1e9) / 1e9;
  return { x: v.x * cos - v.y * sin, y: v.x * sin + v.y * cos };
}

/** Punto sull'immagine, come frazione di larghezza e altezza (0–1): non dipende dallo zoom. */
export interface Point {
  x: number;
  y: number;
}

/** Distanza tracciata tra due punti. */
export interface Measure {
  id: number;
  a: Point;
  b: Point;
}

const number = (v: number, digits: number) => v.toLocaleString('it-IT', { minimumFractionDigits: digits, maximumFractionDigits: digits });

/**
 * Testo di una misura. In millimetri se il file DICOM dichiara la scala ("≈" se è quella del
 * rivelatore, cioè un po' ingrandita rispetto al vero); altrimenti in pixel dell'immagine.
 * `geometry`: `undefined` = non ancora arrivata, `null` = non disponibile.
 */
export function measureLabel(m: { a: Point; b: Point }, geometry: ImagingGeometryDTO | null | undefined, natural: { w: number; h: number }): string {
  if (geometry === undefined) return '…';
  const columns = geometry?.columns ?? natural.w;
  const rows = geometry?.rows ?? natural.h;
  const dx = (m.b.x - m.a.x) * columns;
  const dy = (m.b.y - m.a.y) * rows;
  const spacing = geometry?.spacing;
  if (!spacing) return `${number(Math.hypot(dx, dy), 0)} px`;
  const mm = Math.hypot(dx * spacing.column, dy * spacing.row);
  return `${geometry.spacingSource === 'detector' ? '≈ ' : ''}${number(mm, 1)} mm`;
}
