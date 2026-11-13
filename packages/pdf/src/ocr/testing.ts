import { createCanvas, loadImage } from '@napi-rs/canvas';
import { PDFDocument } from 'pdf-lib';
import { makePdf } from '../testing';
import { renderPages } from './render';

/**
 * Crea una "scansione" finta (solo per test e benchmark: dati INVENTATI).
 * Il referto viene scritto come PDF di testo, trasformato in immagine, leggermente ruotato e
 * sporcato come farebbe uno scanner, poi rimesso in un PDF che contiene SOLO l'immagine.
 */
export async function makeScannedPdf(
  pages: Parameters<typeof makePdf>[0],
  opts: { dpi?: number; rotationDeg?: number; noise?: number; jpegQuality?: number } = {},
): Promise<Uint8Array> {
  const dpi = opts.dpi ?? 200;
  const rotation = ((opts.rotationDeg ?? 0.6) * Math.PI) / 180;
  const noise = opts.noise ?? 0.015;
  const out = await PDFDocument.create();

  let seed = 42; // numeri pseudo-casuali ripetibili: stessi test, stessi risultati
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

  for await (const page of renderPages(makePdf(pages), { maxPages: 50, dpi, maxSidePx: 10_000, clean: false })) {
    const img = await loadImage(page.png);
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, img.width, img.height);
    ctx.translate(img.width / 2, img.height / 2);
    ctx.rotate(rotation);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Puntini sparsi e un leggero grigio di fondo, come la carta passata allo scanner.
    const pixels = ctx.getImageData(0, 0, img.width, img.height);
    const d = pixels.data;
    for (let i = 0; i < d.length; i += 4) {
      const speck = rand() < noise ? 90 + rand() * 80 : 0;
      for (let c = 0; c < 3; c++) d[i + c] = Math.max(0, Math.min(255, d[i + c]! - 12 - speck));
    }
    ctx.putImageData(pixels, 0, 0);

    const jpg = await canvas.encode('jpeg', opts.jpegQuality ?? 80);
    const embedded = await out.embedJpg(jpg);
    const p = out.addPage([page.width, page.height]);
    p.drawImage(embedded, { x: 0, y: 0, width: page.width, height: page.height });
  }
  return out.save();
}
