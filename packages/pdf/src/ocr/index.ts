import type { PdfDocument, PdfPage, PdfTextItem } from '../extract';
import { nativeEngine, wasmEngine, type OcrEngine, type OcrWord } from './engines';
import { renderPages, type PageRegion, type RenderLimits } from './render';

/**
 * Riconoscimento del testo (OCR) nei PDF scansionati, interamente in locale.
 *
 * Restituisce lo stesso `PdfDocument` di `extractPdf`: il resto della lettura dei referti
 * (`buildLines`, `extractReport`, l'anonimizzazione) funziona senza modifiche.
 *
 * Modulo volutamente separato (`@alby/pdf/ocr`) e caricato solo quando serve: togliere l'OCR
 * significa non importarlo più.
 */

export { OcrTimeoutError, parseTsv, type OcrEngine, type OcrWord } from './engines';
export { getPageSizes, PageNotFoundError, renderPagePreview, TooManyPagesError, type PageRegion, type RenderLimits } from './render';

export interface OcrOptions extends Partial<RenderLimits> {
  engine: 'native' | 'wasm';
  lang?: string;
  pageTimeoutMs?: number;
  tesseractPath?: string;
  /** Solo questa pagina (numerata da 1), eventualmente solo una sua zona. Senza: tutte le pagine. */
  only?: { page: number; region?: PageRegion };
}

export interface OcrStats {
  engine: 'native' | 'wasm';
  pages: number;
  words: number;
  /** Affidabilità media delle parole (0–100). */
  confidence: number;
  ms: number;
}

export interface OcrDocument extends PdfDocument {
  ocr: OcrStats;
  /** Parole con affidabilità bassa (testo, non coordinate): servono a segnalare i valori da ricontrollare. */
  uncertainWords: string[];
}

/** Sotto questa affidabilità una parola va ricontrollata a mano. */
export const LOW_CONFIDENCE = 75;

const DEFAULT_LIMITS: RenderLimits = { maxPages: 10, dpi: 300, maxSidePx: 4200 };

// Un solo OCR alla volta in tutto il processo: gli altri aspettano in coda.
// Su una VPS piccola evita che più caricamenti contemporanei esauriscano CPU e memoria.
let queue: Promise<unknown> = Promise.resolve();
function exclusive<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  queue = run.catch(() => {});
  return run;
}

/** Parole OCR → frammenti di testo in punti PDF, come quelli di `extractPdf`. */
export function wordsToItems(words: OcrWord[], scale: number, offset = { x: 0, y: 0 }): PdfTextItem[] {
  const r = (n: number) => Math.round((n / scale) * 10) / 10;
  return words.map((w) => {
    const lineHeight = w.lineY1 - w.lineY0;
    return {
      text: w.text,
      x: r(w.x0 + offset.x),
      // `extractPdf` usa la linea di base del testo: per l'OCR la si stima dal fondo della riga.
      top: r(w.lineY1 + offset.y - lineHeight * 0.2),
      width: r(w.x1 - w.x0),
      height: r(lineHeight * 0.8),
      font: 'ocr',
    };
  });
}

export function ocrPdf(data: Uint8Array, opts: OcrOptions): Promise<OcrDocument> {
  return exclusive(async () => {
    const started = Date.now();
    const limits: RenderLimits = {
      maxPages: opts.maxPages ?? DEFAULT_LIMITS.maxPages,
      dpi: opts.dpi ?? DEFAULT_LIMITS.dpi,
      maxSidePx: opts.maxSidePx ?? DEFAULT_LIMITS.maxSidePx,
    };
    const engineOpts = { lang: opts.lang ?? 'ita', pageTimeoutMs: opts.pageTimeoutMs ?? 60_000, tesseractPath: opts.tesseractPath };
    const engine: OcrEngine = opts.engine === 'native' ? nativeEngine(engineOpts) : await wasmEngine(engineOpts);

    const pages: PdfPage[] = [];
    const uncertain = new Set<string>();
    let words = 0;
    let confidenceSum = 0;
    try {
      for await (const page of renderPages(data, limits, opts.only)) {
        const found = await engine.recognize(page.png);
        words += found.length;
        for (const w of found) {
          confidenceSum += w.confidence;
          if (w.confidence < LOW_CONFIDENCE) uncertain.add(w.text);
        }
        pages.push({
          number: page.number,
          width: Math.round(page.width * 10) / 10,
          height: Math.round(page.height * 10) / 10,
          items: wordsToItems(found, page.scale, { x: page.offsetX, y: page.offsetY }),
        });
      }
    } finally {
      await engine.close();
    }
    return {
      pages,
      info: {},
      uncertainWords: [...uncertain],
      ocr: {
        engine: engine.name,
        pages: pages.length,
        words,
        confidence: words ? Math.round(confidenceSum / words) : 0,
        ms: Date.now() - started,
      },
    };
  });
}
