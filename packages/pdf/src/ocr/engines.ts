/// <reference path="./tesseract-data.d.ts" />
import { spawn } from 'node:child_process';
import path from 'node:path';

/** Una parola riconosciuta, con il riquadro in pixel dell'immagine e quello della sua riga. */
export interface OcrWord {
  text: string;
  /** Affidabilità dichiarata dal motore, da 0 a 100. */
  confidence: number;
  x0: number;
  x1: number;
  /** Riquadro dell'intera riga: tutte le parole di una riga condividono la stessa altezza. */
  lineY0: number;
  lineY1: number;
}

/** Un motore OCR: riceve l'immagine di una pagina, restituisce le parole. Lavora solo in locale. */
export interface OcrEngine {
  readonly name: 'native' | 'wasm';
  recognize(png: Buffer): Promise<OcrWord[]>;
  close(): Promise<void>;
}

export interface EngineOptions {
  /** Codice della lingua di Tesseract ("ita"). */
  lang: string;
  /** Tempo massimo per pagina: oltre, il lavoro viene interrotto. */
  pageTimeoutMs: number;
  /** Solo per "native": percorso del programma `tesseract` (di default quello nel PATH). */
  tesseractPath?: string;
}

export class OcrTimeoutError extends Error {
  constructor(ms: number) {
    super(`Il riconoscimento del testo ha superato ${Math.round(ms / 1000)} secondi per una pagina`);
    this.name = 'OcrTimeoutError';
  }
}

// ───────────────────────────── Tesseract nativo ─────────────────────────────

/**
 * Tesseract installato nel sistema (nell'immagine Docker: `apk add tesseract-ocr`).
 * L'immagine entra da stdin e il risultato esce da stdout: nessun file temporaneo.
 */
export function nativeEngine(opts: EngineOptions): OcrEngine {
  return {
    name: 'native',
    recognize: (png) =>
      new Promise((resolve, reject) => {
        // (turbopackIgnore: è un programma del sistema, non un file del progetto da includere nella build)
        const child = spawn(/*turbopackIgnore: true*/ opts.tesseractPath ?? 'tesseract', ['stdin', 'stdout', '-l', opts.lang, 'tsv'], {
          stdio: ['pipe', 'pipe', 'pipe'],
          // Un solo core: con più thread Tesseract di solito è più lento e ruba CPU agli altri servizi.
          // Ambiente minimo: al processo non passano le variabili dell'app (password del database, ecc.).
          env: {
            PATH: process.env.PATH ?? '',
            OMP_THREAD_LIMIT: '1',
            ...(process.env.TESSDATA_PREFIX ? { TESSDATA_PREFIX: process.env.TESSDATA_PREFIX } : {}),
          } as Record<string, string> as unknown as NodeJS.ProcessEnv, // (Next.js rende NODE_ENV obbligatoria nel tipo)
          windowsHide: true,
        });
        const out: Buffer[] = [];
        let err = '';
        const timer = setTimeout(() => {
          child.kill('SIGKILL');
          reject(new OcrTimeoutError(opts.pageTimeoutMs));
        }, opts.pageTimeoutMs);
        child.stdout.on('data', (d: Buffer) => out.push(d));
        // Lo stderr di Tesseract contiene solo messaggi tecnici, mai il testo riconosciuto.
        child.stderr.on('data', (d: Buffer) => (err = (err + d.toString()).slice(-500)));
        child.on('error', (e) => {
          clearTimeout(timer);
          reject(new Error(`Impossibile avviare tesseract: ${e.message}`));
        });
        child.on('close', (code) => {
          clearTimeout(timer);
          if (code === 0) resolve(parseTsv(Buffer.concat(out).toString('utf8')));
          else reject(new Error(`tesseract è terminato con codice ${code}: ${err.trim().split('\n').pop() ?? ''}`));
        });
        child.stdin.on('error', () => {}); // il processo può chiudersi prima di aver letto tutto
        child.stdin.end(png);
      }),
    close: async () => {},
  };
}

/** Formato TSV di Tesseract: livello 4 = riga, livello 5 = parola. */
export function parseTsv(tsv: string): OcrWord[] {
  const words: OcrWord[] = [];
  const lines = new Map<string, { y0: number; y1: number }>();
  for (const row of tsv.split('\n').slice(1)) {
    const c = row.split('\t');
    if (c.length < 12) continue;
    const [level, page, block, par, line, , left, top, width, height, conf] = c.slice(0, 11).map(Number) as number[];
    const key = `${page}.${block}.${par}.${line}`;
    if (level === 4) lines.set(key, { y0: top!, y1: top! + height! });
    if (level !== 5) continue;
    const text = c.slice(11).join('\t').trim();
    const ln = lines.get(key);
    if (!text || !ln) continue;
    words.push({ text, confidence: conf!, x0: left!, x1: left! + width!, lineY0: ln.y0, lineY1: ln.y1 });
  }
  return words;
}

// ───────────────────────────── Tesseract in WebAssembly ─────────────────────────────

/**
 * Tesseract compilato in WebAssembly (pacchetto npm `tesseract.js`): non richiede installazioni nel
 * sistema, comodo in sviluppo su Windows. Motore e lingua sono letti da node_modules: NESSUN download
 * (di default tesseract.js scaricherebbe la lingua da una CDN).
 */
export async function wasmEngine(opts: EngineOptions): Promise<OcrEngine> {
  if (opts.lang !== 'ita') throw new Error(`Lingua OCR non disponibile: ${opts.lang}`);
  const { createWorker } = await import('tesseract.js');
  // Il percorso della lingua lo dà il pacchetto stesso: dentro Next.js (Turbopack) i percorsi calcolati
  // dal nostro codice sono virtuali ("[project]/…"), mentre il pacchetto, escluso dal bundle
  // (serverExternalPackages), gira in Node con il suo percorso reale.
  const ita = (await import('@tesseract.js-data/ita')).default;
  const worker = await createWorker(opts.lang, 1 /* OEM.LSTM_ONLY */, {
    // Versione "best_int": più piccola e veloce di quella predefinita del pacchetto, stessa qualità per l'LSTM.
    langPath: path.join(path.dirname(ita.langPath), '4.0.0_best_int'),
    gzip: true,
    // Niente cache su disco: la lingua si legge ogni volta da node_modules.
    cacheMethod: 'none',
    // Senza questo, un errore del worker (es. file mancante) diventerebbe un'eccezione non gestita
    // che blocca la richiesta; così invece arriva qui come promessa rifiutata e si compila a mano.
    errorHandler: () => {},
  });
  let terminated = false;
  return {
    name: 'wasm',
    async recognize(png) {
      let timer: NodeJS.Timeout | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          terminated = true;
          void worker.terminate();
          reject(new OcrTimeoutError(opts.pageTimeoutMs));
        }, opts.pageTimeoutMs);
      });
      try {
        const { data } = await Promise.race([worker.recognize(png, {}, { blocks: true, text: false }), timeout]);
        const words: OcrWord[] = [];
        for (const block of data.blocks ?? []) {
          for (const par of block.paragraphs) {
            for (const line of par.lines) {
              for (const w of line.words) {
                const text = w.text.trim();
                if (!text) continue;
                words.push({ text, confidence: w.confidence, x0: w.bbox.x0, x1: w.bbox.x1, lineY0: line.bbox.y0, lineY1: line.bbox.y1 });
              }
            }
          }
        }
        return words;
      } finally {
        clearTimeout(timer);
      }
    },
    async close() {
      if (!terminated) await worker.terminate();
    },
  };
}
