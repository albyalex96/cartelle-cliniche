import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

/** Un frammento di testo come lo restituisce il PDF, con la sua posizione sulla pagina. */
export interface PdfTextItem {
  text: string;
  /** Distanza dal bordo sinistro, in punti PDF (1/72 di pollice). */
  x: number;
  /** Distanza dal bordo superiore (coordinate "dall'alto", più comode da leggere). */
  top: number;
  width: number;
  /** Altezza del carattere: utile per distinguere titoli e testo normale. */
  height: number;
  font: string;
}

export interface PdfPage {
  number: number;
  width: number;
  height: number;
  items: PdfTextItem[];
}

export interface PdfDocument {
  pages: PdfPage[];
  /** Metadati dichiarati dal PDF (es. programma che l'ha generato): aiutano a riconoscere il laboratorio. */
  info: { producer?: string; creator?: string };
}

/** Il PDF non contiene testo selezionabile (scansione): l'estrazione automatica non è possibile. */
export class NoTextLayerError extends Error {
  constructor() {
    super('Il PDF non contiene testo selezionabile (probabilmente è una scansione)');
    this.name = 'NoTextLayerError';
  }
}

/**
 * Estrae il testo di un PDF con le coordinate di ogni frammento.
 * Tutto avviene in locale: nessun dato lascia il computer/server.
 */
export async function extractPdf(data: Uint8Array): Promise<PdfDocument> {
  const loadingTask = getDocument({
    // pdf.js trasferisce (e quindi svuota) il buffer ricevuto: gli si passa una copia.
    data: data.slice(),
    // Niente font di sistema e niente conversione dei font: servono solo i testi, non il rendering.
    useSystemFonts: false,
    disableFontFace: true,
    // Moduli XFA (form dinamici) e script del PDF non servono e non vengono interpretati.
    enableXfa: false,
    verbosity: 0,
  });
  const doc = await loadingTask.promise;
  try {
    const meta = await doc.getMetadata().catch(() => null);
    const rawInfo = (meta?.info ?? {}) as Record<string, unknown>;
    const pages: PdfPage[] = [];

    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items: PdfTextItem[] = [];
      for (const item of content.items) {
        if (!('str' in item) || !item.str.trim()) continue;
        const [, , , , e, f] = item.transform as number[];
        items.push({
          text: item.str,
          x: round(e ?? 0),
          top: round(viewport.height - (f ?? 0)),
          width: round(item.width),
          height: round(item.height),
          font: item.fontName,
        });
      }
      pages.push({ number: n, width: round(viewport.width), height: round(viewport.height), items });
      page.cleanup();
    }

    if (pages.every((p) => p.items.length === 0)) throw new NoTextLayerError();
    return {
      pages,
      info: {
        producer: typeof rawInfo.Producer === 'string' ? rawInfo.Producer : undefined,
        creator: typeof rawInfo.Creator === 'string' ? rawInfo.Creator : undefined,
      },
    };
  } finally {
    await loadingTask.destroy();
  }
}

const round = (n: number) => Math.round(n * 10) / 10;
