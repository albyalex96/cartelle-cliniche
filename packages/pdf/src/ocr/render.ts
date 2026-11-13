import { createCanvas, type Canvas } from '@napi-rs/canvas';
import { getDocument, type PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { cleanForOcr } from './preprocess';

/** Zona di una pagina, in frazioni della pagina (0–1) misurate dall'angolo in alto a sinistra. */
export interface PageRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Una pagina del PDF (o una sua zona) trasformata in immagine, pronta per l'OCR. */
export interface RenderedPage {
  number: number;
  /** Dimensioni della pagina in punti PDF (le stesse di `extractPdf`). */
  width: number;
  height: number;
  /** Pixel per punto PDF: serve a riportare le coordinate dell'OCR in punti. */
  scale: number;
  /** Posizione della zona ritagliata nella pagina, in pixel (0 se è la pagina intera). */
  offsetX: number;
  offsetY: number;
  png: Buffer;
}

export interface RenderLimits {
  /** Oltre questo numero di pagine il PDF viene rifiutato (protegge CPU e memoria del server). */
  maxPages: number;
  /** Risoluzione di lavoro: 300 DPI è lo standard per l'OCR. */
  dpi: number;
  /** Lato massimo dell'immagine in pixel (pagine enormi vengono ridotte, non rifiutate). */
  maxSidePx: number;
  /** Pulizia dell'immagine prima dell'OCR (vedi `preprocess.ts`). Di default attiva. */
  clean?: boolean;
}

export class TooManyPagesError extends Error {
  constructor(readonly pages: number, readonly max: number) {
    super(`Il PDF ha ${pages} pagine: il riconoscimento del testo è limitato a ${max}`);
    this.name = 'TooManyPagesError';
  }
}

export class PageNotFoundError extends Error {
  constructor(readonly page: number) {
    super(`Il PDF non ha la pagina ${page}`);
    this.name = 'PageNotFoundError';
  }
}

async function openPdf<T>(data: Uint8Array, fn: (doc: PDFDocumentProxy) => Promise<T>): Promise<T> {
  const loadingTask = getDocument({
    // Copia (pdf.js svuota il buffer ricevuto), sempre come Uint8Array semplice: pdf.js rifiuta i Buffer.
    data: new Uint8Array(data),
    enableXfa: false,
    useSystemFonts: false,
    verbosity: 0,
  });
  try {
    return await fn(await loadingTask.promise);
  } finally {
    await loadingTask.destroy();
  }
}

/** Dimensioni delle pagine (in punti PDF), senza disegnarle: operazione leggera. */
export function getPageSizes(data: Uint8Array): Promise<{ width: number; height: number }[]> {
  return openPdf(data, async (doc) => {
    const sizes = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const v = (await doc.getPage(n)).getViewport({ scale: 1 });
      sizes.push({ width: Math.round(v.width * 10) / 10, height: Math.round(v.height * 10) / 10 });
    }
    return sizes;
  });
}

async function drawPage(doc: PDFDocumentProxy, n: number, scaleFor: (w: number, h: number) => number) {
  if (!Number.isInteger(n) || n < 1 || n > doc.numPages) throw new PageNotFoundError(n);
  const page = await doc.getPage(n);
  const base = page.getViewport({ scale: 1 });
  const scale = scaleFor(base.width, base.height);
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const ctx = canvas.getContext('2d');
  // Sfondo bianco: senza, le zone trasparenti diventano nere e confondono l'OCR.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas: canvas as never, canvasContext: ctx as never, viewport }).promise;
  page.cleanup();
  return { canvas, base, scale };
}

/** Ritaglia una zona (in frazioni della pagina) dall'immagine della pagina; `withMargin` per l'OCR. */
function crop(canvas: Canvas, region: PageRegion, withMargin = true) {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const x0 = Math.floor(clamp(region.x) * canvas.width);
  const y0 = Math.floor(clamp(region.y) * canvas.height);
  const x1 = Math.ceil(clamp(region.x + region.width) * canvas.width);
  const y1 = Math.ceil(clamp(region.y + region.height) * canvas.height);
  const w = Math.max(1, x1 - x0);
  const h = Math.max(1, y1 - y0);
  // Margine bianco attorno alla zona: Tesseract legge male il testo che tocca il bordo dell'immagine
  // (succede spesso, perché i riquadri disegnati a mano tagliano le lettere).
  const pad = withMargin ? Math.round(canvas.width * 0.02) : 0;
  const out = createCanvas(w + pad * 2, h + pad * 2);
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(canvas, x0, y0, w, h, pad, pad, w, h);
  return { canvas: out, offsetX: x0 - pad, offsetY: y0 - pad };
}

/**
 * Trasforma le pagine del PDF in immagini PNG, UNA ALLA VOLTA (una pagina A4 a 300 DPI occupa
 * ~35 MB di memoria): il chiamante elabora ogni pagina prima che venga generata la successiva.
 * Con `only` si elabora una sola pagina, eventualmente solo una sua zona.
 * Tutto in memoria: nessun file temporaneo su disco.
 */
export async function* renderPages(
  data: Uint8Array,
  limits: RenderLimits,
  only?: { page: number; region?: PageRegion },
): AsyncGenerator<RenderedPage> {
  const loadingTask = getDocument({ data: new Uint8Array(data), enableXfa: false, useSystemFonts: false, verbosity: 0 });
  const doc = await loadingTask.promise;
  try {
    if (!only && doc.numPages > limits.maxPages) throw new TooManyPagesError(doc.numPages, limits.maxPages);
    const numbers = only ? [only.page] : Array.from({ length: doc.numPages }, (_, i) => i + 1);
    for (const n of numbers) {
      const drawn = await drawPage(doc, n, (w, h) => Math.min(limits.dpi / 72, limits.maxSidePx / Math.max(w, h)));
      const part = only?.region ? crop(drawn.canvas, only.region) : { canvas: drawn.canvas, offsetX: 0, offsetY: 0 };
      if (limits.clean !== false) {
        const ctx = part.canvas.getContext('2d');
        const pixels = ctx.getImageData(0, 0, part.canvas.width, part.canvas.height);
        cleanForOcr(pixels.data, part.canvas.width, part.canvas.height, drawn.scale * 72);
        ctx.putImageData(pixels, 0, 0);
      }
      yield {
        number: n,
        width: drawn.base.width,
        height: drawn.base.height,
        scale: drawn.scale,
        offsetX: part.offsetX,
        offsetY: part.offsetY,
        png: await part.canvas.encode('png'),
      };
    }
  } finally {
    await loadingTask.destroy();
  }
}

/** Immagine di una pagina da mostrare nel browser (JPEG, larghezza in pixel). Nessuna pulizia. */
export function renderPagePreview(data: Uint8Array, page: number, widthPx: number): Promise<Buffer> {
  return openPdf(data, async (doc) => {
    const { canvas } = await drawPage(doc, page, (w) => widthPx / w);
    return canvas.encode('jpeg', 85);
  });
}

/**
 * Ritaglio di una zona di una pagina come immagine JPEG (per salvarlo tra le immagini del paziente).
 * 200 DPI: abbastanza per leggere testo e dettagli, file contenuti.
 */
export function renderRegionJpeg(data: Uint8Array, page: number, region: PageRegion, dpi = 200): Promise<{ jpeg: Buffer; width: number; height: number }> {
  return openPdf(data, async (doc) => {
    const { canvas } = await drawPage(doc, page, (w, h) => Math.min(dpi / 72, 6000 / Math.max(w, h)));
    const part = crop(canvas, region, false);
    return { jpeg: await part.canvas.encode('jpeg', 90), width: part.canvas.width, height: part.canvas.height };
  });
}
