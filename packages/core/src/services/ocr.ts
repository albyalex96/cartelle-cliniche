import { buildLines, extractLabResults, extractReport, GENERIC_PARSER, linesToText, parseItalianDate, type LayoutLine } from '@alby/pdf';
import { idSchema, SCAN_PARSER_ID, type ReportDraftDTO, type ScanReadDTO } from '@alby/shared';
import { z } from 'zod';
import { requireUser } from '../auth/guard';
import { getConfig } from '../config';
import type { RequestContext } from '../context';
import { getPrisma } from '../db';
import { AppError, notFound } from '../errors';
import { requirePatientPermission } from './access';
import { writeAudit } from './audit';
import { documentAsPdf, draftFromExtracted, loadPatientFile, toDraftRows } from './reports';

/**
 * PDF scansionati: l'utente sceglie sul documento le zone da leggere con l'OCR (riconoscimento del
 * testo), che avviene interamente sul server. Con OCR_ENABLED=false (predefinito) il modulo OCR non
 * viene nemmeno caricato e le scansioni si compilano a mano, come prima.
 */

export function isOcrEnabled() {
  return getConfig().OCR_ENABLED;
}

export const SCAN_HINT =
  'Il PDF è una scansione, senza testo selezionabile: usa il riconoscimento del testo (OCR). Premi il bottone accanto a un campo ' +
  '(o “Dalla scansione” nei valori) e seleziona sul documento la zona da leggere. Controlla sempre il risultato: virgole, punti e unità di misura possono essere letti male.';

function requireOcr() {
  if (!isOcrEnabled()) throw new AppError(404, 'Il riconoscimento del testo non è attivo', 'OCR_DISABLED');
}

const pageSchema = z.coerce.number().int().min(1).max(1000);

const fraction = z.number().min(0).max(1);
const scanReadSchema = z.object({
  page: pageSchema,
  mode: z.enum(['table', 'date', 'line', 'paragraph', 'page']),
  // Zona minima: l'1% della pagina in ciascuna direzione (un clic senza trascinare non basta).
  region: z.object({ x: fraction, y: fraction, width: z.number().min(0.01).max(1), height: z.number().min(0.01).max(1) }).optional(),
});

const lower = (s: string) => s.toLocaleLowerCase('it');
const words = (s: string | undefined) => lower(s ?? '').split(/\s+/).filter(Boolean);

/**
 * Legge con l'OCR una zona di una pagina (o la pagina intera) di un PDF del paziente: in revisione
 * o già collegato a un referto che si sta modificando.
 * Restituisce una proposta per il form: nulla viene salvato.
 */
export async function readScanArea(ctx: RequestContext, rawFileId: unknown, rawInput: unknown): Promise<ScanReadDTO> {
  const authed = requireUser(ctx);
  requireOcr();
  const id = idSchema.safeParse(rawFileId);
  if (!id.success) throw notFound('File');
  const input = scanReadSchema.parse(rawInput);
  if (input.mode !== 'page' && !input.region) throw new AppError(400, 'Seleziona una zona del documento', 'NO_REGION');

  const owner = await getPrisma().storedFile.findUnique({ where: { id: id.data }, select: { patientId: true } });
  if (!owner) throw notFound('File');
  await requirePatientPermission(authed, owner.patientId, 'edit');
  const file = await loadPatientFile(owner.patientId, id.data);

  const config = getConfig();
  const { ocrPdf } = await import('@alby/pdf/ocr');
  const started = Date.now();
  const audit = (details: Record<string, unknown>) =>
    writeAudit(ctx, 'report.file_ocr', {
      entity: 'file',
      entityId: file.id,
      // Nel registro solo numeri: mai il testo riconosciuto.
      details: { patientId: file.patientId, page: input.page, mode: input.mode, ...details },
    });

  let doc: Awaited<ReturnType<typeof ocrPdf>>;
  try {
    doc = await ocrPdf(await documentAsPdf(file), {
      engine: config.OCR_ENGINE,
      pageTimeoutMs: config.OCR_PAGE_TIMEOUT_SECONDS * 1000,
      tesseractPath: config.OCR_TESSERACT_PATH,
      only: { page: input.page, region: input.mode === 'page' ? undefined : input.region },
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : 'Error';
    // Il messaggio d'errore è tecnico (codici, pagine): non contiene il testo del documento.
    console.error(`[ocr] lettura non riuscita (${name}):`, err instanceof Error ? err.message : err);
    await audit({ ok: false, error: name, ms: Date.now() - started });
    if (name === 'PageNotFoundError') throw new AppError(400, 'Pagina inesistente', 'PAGE_NOT_FOUND');
    if (name === 'OcrTimeoutError') throw new AppError(504, 'La lettura richiedeva troppo tempo: prova con una zona più piccola', 'OCR_TIMEOUT');
    throw new AppError(500, 'Lettura del testo non riuscita', 'OCR_FAILED');
  }
  await audit({ ok: true, engine: doc.ocr.engine, words: doc.ocr.words, confidence: doc.ocr.confidence, ms: doc.ocr.ms });

  const lines = buildLines(doc);
  const uncertainWords = new Set(doc.uncertainWords.map(lower));
  const isUncertain = (...fields: (string | undefined)[]) => fields.some((f) => words(f).some((w) => uncertainWords.has(w)));
  const uncertainRows = (rows: ReportDraftDTO['values']['results']) =>
    rows.flatMap((r, i) => (isUncertain(r.name, r.value, r.unit, r.referenceRange) ? [i] : []));
  const common = { confidence: doc.ocr.confidence, parser: { id: SCAN_PARSER_ID, version: GENERIC_PARSER.versione } };

  switch (input.mode) {
    case 'table': {
      const rows = toDraftRows(extractLabResults(lines));
      return { ...common, mode: 'table', rows, uncertain: uncertainRows(rows) };
    }
    case 'page': {
      const extracted = extractReport(lines);
      const { values, identity } = await draftFromExtracted(file.patientId, extracted);
      const warnings = [...(identity && identity.status !== 'ok' ? [identity.message] : []), ...extracted.avvisi];
      return { ...common, mode: 'page', values, uncertain: uncertainRows(values.results), warnings };
    }
    default: {
      const text = textFor(input.mode, lines);
      return { ...common, mode: input.mode, text, uncertain: isUncertain(text) };
    }
  }
}

function textFor(mode: 'date' | 'line' | 'paragraph', lines: LayoutLine[]) {
  if (mode === 'paragraph') return linesToText(lines);
  const flat = lines
    .map((l) => l.cells.map((c) => c.text).join(' '))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Le date vanno nel formato del campo (AAAA-MM-GG); se non c'è una data valida, niente.
  return mode === 'date' ? (parseItalianDate(flat) ?? '') : flat;
}
