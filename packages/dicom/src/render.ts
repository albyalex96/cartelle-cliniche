import * as dicomParserModule from 'dicom-parser';
import type { DataSet, Element } from 'dicom-parser';

// La libreria è un pacchetto UMD: in Node le funzioni stanno sotto `default`, nei bundler direttamente.
const dicomParser = ((dicomParserModule as { default?: typeof dicomParserModule }).default ?? dicomParserModule) as typeof dicomParserModule;

/**
 * Anteprima di un'immagine DICOM: i pixel vengono letti dal file, portati a 8 bit con la
 * "finestra" di luminosità indicata nel file (o, se manca, con l'intero intervallo dei valori)
 * e rimpiccioliti. Non è un visualizzatore diagnostico: serve a riconoscere l'immagine.
 *
 * Formati letti: immagini non compresse (grigi a 8/16 bit, colori RGB/YBR a 8 bit) e JPEG
 * "baseline", che il browser sa già mostrare e viene restituito così com'è.
 * Gli altri formati compressi (JPEG lossless, JPEG 2000, JPEG-LS, RLE) non sono ancora letti.
 */
export type DicomPreview =
  /** Pixel a 8 bit, riga per riga: 1 canale (grigi) o 3 (RGB). */
  | { kind: 'pixels'; width: number; height: number; channels: 1 | 3; pixels: Uint8Array; frames: number }
  /** Immagine JPEG già pronta (dimensioni originali). */
  | { kind: 'jpeg'; data: Uint8Array; frames: number };

export interface PreviewOptions {
  /** Lato più lungo dell'anteprima, in pixel (l'immagine non viene mai ingrandita). */
  maxSize: number;
  /** Per i filmati (ecografie): quale fotogramma, da 0. */
  frame?: number;
}

const UNCOMPRESSED_LE = new Set(['1.2.840.10008.1.2', '1.2.840.10008.1.2.1']);
const UNCOMPRESSED_BE = '1.2.840.10008.1.2.2';
const JPEG_BASELINE = '1.2.840.10008.1.2.4.50';

/** Primo valore numerico di un elemento (alcuni, come la finestra, ne hanno più di uno). */
function num(ds: DataSet, tag: string): number | undefined {
  const raw = ds.string(tag, 0);
  if (raw === undefined || raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function jpegFrame(ds: DataSet, el: Element, frame: number, frames: number): Uint8Array | null {
  const fragments = el.fragments?.length ?? 0;
  if (!fragments) return null;
  // Un solo fotogramma: può essere diviso in più frammenti, si uniscono tutti.
  if (frames === 1) return dicomParser.readEncapsulatedPixelDataFromFragments(ds, el, 0, fragments);
  if (el.basicOffsetTable?.length) return dicomParser.readEncapsulatedImageFrame(ds, el, frame);
  if (fragments === frames) return dicomParser.readEncapsulatedPixelDataFromFragments(ds, el, frame);
  return dicomParser.readEncapsulatedImageFrame(ds, el, frame, dicomParser.createJPEGBasicOffsetTable(ds, el));
}

/** Anteprima di un file DICOM, oppure `null` se il file non contiene un'immagine leggibile. */
export function renderDicomPreview(bytes: Uint8Array, { maxSize, frame = 0 }: PreviewOptions): DicomPreview | null {
  let ds: DataSet;
  try {
    ds = dicomParser.parseDicom(bytes);
  } catch {
    return null;
  }
  try {
    const el = ds.elements['x7fe00010'];
    const rows = ds.uint16('x00280010');
    const cols = ds.uint16('x00280011');
    if (!el || !rows || !cols) return null;
    const frames = Math.max(1, Math.floor(num(ds, 'x00280008') ?? 1));
    const f = Math.min(Math.max(0, Math.floor(frame)), frames - 1);
    const syntax = ds.string('x00020010') ?? '1.2.840.10008.1.2';

    if (syntax === JPEG_BASELINE) {
      const data = jpegFrame(ds, el, f, frames);
      return data && data[0] === 0xff && data[1] === 0xd8 ? { kind: 'jpeg', data, frames } : null;
    }
    const bigEndian = syntax === UNCOMPRESSED_BE;
    if (!bigEndian && !UNCOMPRESSED_LE.has(syntax)) return null;

    const samples = ds.uint16('x00280002') ?? 1;
    const allocated = ds.uint16('x00280100') ?? 8;
    const stored = Math.min(ds.uint16('x00280101') ?? allocated, allocated);
    const signed = ds.uint16('x00280103') === 1;
    const photometric = (ds.string('x00280004') ?? 'MONOCHROME2').trim().toUpperCase();
    const bytesPer = allocated / 8;
    if ((allocated !== 8 && allocated !== 16) || (samples !== 1 && samples !== 3)) return null;
    if (samples === 3 && allocated !== 8) return null;
    if (samples === 1 && !photometric.startsWith('MONOCHROME')) return null; // es. PALETTE COLOR

    const frameBytes = rows * cols * samples * bytesPer;
    const start = el.dataOffset + f * frameBytes;
    if (start + frameBytes > el.dataOffset + el.length || start + frameBytes > bytes.length) return null;
    const src = bytes;

    // Riduzione: ogni pixel dell'anteprima è la media di un blocco step×step.
    const step = Math.max(1, Math.ceil(Math.max(rows, cols) / Math.max(1, maxSize)));
    const width = Math.max(1, Math.floor(cols / step));
    const height = Math.max(1, Math.floor(rows / step));
    const area = step * step;

    if (samples === 3) {
      const planar = ds.uint16('x00280006') === 1;
      const plane = rows * cols;
      const ybr = photometric === 'YBR_FULL';
      const pixels = new Uint8Array(width * height * 3);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          let a = 0, b = 0, c = 0;
          for (let dy = 0; dy < step; dy++) {
            for (let dx = 0; dx < step; dx++) {
              const p = (y * step + dy) * cols + x * step + dx;
              if (planar) {
                a += src[start + p]!;
                b += src[start + plane + p]!;
                c += src[start + 2 * plane + p]!;
              } else {
                a += src[start + p * 3]!;
                b += src[start + p * 3 + 1]!;
                c += src[start + p * 3 + 2]!;
              }
            }
          }
          a /= area; b /= area; c /= area;
          const o = (y * width + x) * 3;
          if (ybr) {
            // Uint8Array arrotonda e non esce da 0–255 solo con Math: i valori vanno limitati a mano.
            pixels[o] = clamp(a + 1.402 * (c - 128));
            pixels[o + 1] = clamp(a - 0.344136 * (b - 128) - 0.714136 * (c - 128));
            pixels[o + 2] = clamp(a + 1.772 * (b - 128));
          } else {
            pixels[o] = a; pixels[o + 1] = b; pixels[o + 2] = c;
          }
        }
      }
      return { kind: 'pixels', width, height, channels: 3, pixels, frames };
    }

    // Grigi: valori memorizzati → valori reali (pendenza e intercetta) → finestra → 0–255.
    const mask = stored >= 16 ? 0xffff : (1 << stored) - 1;
    const signBit = 1 << (stored - 1);
    const lo = bigEndian ? 1 : 0;
    const values = new Float32Array(width * height);
    let min = Infinity;
    let max = -Infinity;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;
        for (let dy = 0; dy < step; dy++) {
          let p = start + ((y * step + dy) * cols + x * step) * bytesPer;
          for (let dx = 0; dx < step; dx++, p += bytesPer) {
            let v = bytesPer === 1 ? src[p]! : src[p + lo]! | (src[p + 1 - lo]! << 8);
            v &= mask;
            if (signed && v & signBit) v -= mask + 1;
            sum += v;
          }
        }
        const v = sum / area;
        values[y * width + x] = v;
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    const slope = num(ds, 'x00281053') ?? 1;
    const intercept = num(ds, 'x00281052') ?? 0;
    const center = num(ds, 'x00281050');
    const widthW = num(ds, 'x00281051');
    let from: number;
    let to: number;
    if (center !== undefined && widthW !== undefined && widthW >= 1) {
      from = center - 0.5 - (widthW - 1) / 2;
      to = center - 0.5 + (widthW - 1) / 2;
    } else {
      from = Math.min(min * slope + intercept, max * slope + intercept);
      to = Math.max(min * slope + intercept, max * slope + intercept);
    }
    const range = to - from || 1;
    const inverted = photometric === 'MONOCHROME1';
    const pixels = new Uint8Array(width * height);
    for (let i = 0; i < values.length; i++) {
      const g = clamp(((values[i]! * slope + intercept - from) / range) * 255);
      pixels[i] = inverted ? 255 - g : g;
    }
    return { kind: 'pixels', width, height, channels: 1, pixels, frames };
  } catch {
    return null;
  }
}

const clamp = (v: number) => (v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v));
