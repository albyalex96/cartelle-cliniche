import { createCanvas, loadImage } from '@napi-rs/canvas';

/**
 * Foto o immagini caricate dall'utente → JPEG "pulito" da archiviare:
 *  - ricodifica sempre: spariscono i metadati (EXIF: data, modello del telefono, POSIZIONE GPS…);
 *  - rotazione corretta secondo l'EXIF (le foto del telefono sono spesso salvate "di lato"): la applica la libreria;
 *  - sfondo bianco per le parti trasparenti (PNG), lato massimo limitato.
 * Tutto in memoria, sul server.
 */

export type ImageKind = 'jpeg' | 'png' | 'webp';

export class UnsupportedImageError extends Error {
  constructor() {
    super('Formato non supportato: usa un’immagine JPG, PNG o WebP');
    this.name = 'UnsupportedImageError';
  }
}

/** Si guarda il contenuto, non l'estensione del file. */
export function detectImageKind(b: Uint8Array): ImageKind | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b.length > 12 && String.fromCharCode(...b.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...b.subarray(8, 12)) === 'WEBP') return 'webp';
  return null;
}

export class ImageTooLargeError extends Error {
  constructor() {
    super('L’immagine è troppo grande (oltre 100 milioni di pixel)');
    this.name = 'ImageTooLargeError';
  }
}

/** Limite prima di decodificare: un file piccolo può dichiarare dimensioni enormi ed esaurire la memoria. */
const MAX_PIXELS = 100_000_000;

/** Dimensioni scritte nell'intestazione (PNG: IHDR; JPEG: marcatore SOF), senza decodificare. */
export function declaredSize(b: Uint8Array, kind: ImageKind): { width: number; height: number } | null {
  const be16 = (p: number) => (b[p]! << 8) | b[p + 1]!;
  const be32 = (p: number) => ((b[p]! << 24) | (b[p + 1]! << 16) | (b[p + 2]! << 8) | b[p + 3]!) >>> 0;
  if (kind === 'png') return b.length >= 24 ? { width: be32(16), height: be32(20) } : null;
  if (kind === 'jpeg') {
    let o = 2;
    while (o + 9 < b.length && b[o] === 0xff) {
      const marker = b[o + 1]!;
      // SOF0…SOF15, esclusi DHT (C4), JPG (C8) e DAC (CC).
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { height: be16(o + 5), width: be16(o + 7) };
      if (marker === 0xda) return null;
      o += 2 + be16(o + 2);
    }
  }
  return null;
}

export async function imageToJpeg(bytes: Uint8Array, opts: { maxSide?: number; quality?: number } = {}): Promise<{ jpeg: Buffer; width: number; height: number }> {
  const kind = detectImageKind(bytes);
  if (!kind) throw new UnsupportedImageError();
  const size = declaredSize(bytes, kind);
  if (size && size.width * size.height > MAX_PIXELS) throw new ImageTooLargeError();
  // La libreria applica già la rotazione indicata nell'EXIF: larghezza e altezza sono quelle "dritte".
  const img = await loadImage(Buffer.from(bytes));
  const scale = Math.min(1, (opts.maxSide ?? 4000) / Math.max(img.width, img.height));
  const canvas = createCanvas(Math.max(1, Math.round(img.width * scale)), Math.max(1, Math.round(img.height * scale)));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { jpeg: await canvas.encode('jpeg', opts.quality ?? 90), width: canvas.width, height: canvas.height };
}

/** Pagina A4 in punti PDF: l'immagine viene adattata dentro (in verticale o in orizzontale). */
const A4 = { short: 595.28, long: 841.89 };

/**
 * JPEG → PDF di una pagina con l'immagine a pagina intera (senza ricodificarla: la qualità resta quella del JPEG).
 * Senza data di creazione né "Producer": lo stesso JPEG dà sempre lo stesso PDF (serve a riconoscere i doppioni).
 */
export async function jpegToPdf(jpeg: Uint8Array): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib');
  const doc = await PDFDocument.create({ updateMetadata: false });
  const img = await doc.embedJpg(jpeg);
  const portrait = img.height >= img.width;
  const box = portrait ? { width: A4.short, height: A4.long } : { width: A4.long, height: A4.short };
  const scale = Math.min(box.width / img.width, box.height / img.height);
  const width = Math.round(img.width * scale * 100) / 100;
  const height = Math.round(img.height * scale * 100) / 100;
  doc.addPage([width, height]).drawImage(img, { x: 0, y: 0, width, height });
  return doc.save();
}

export { renderRegionJpeg } from './ocr/render';
