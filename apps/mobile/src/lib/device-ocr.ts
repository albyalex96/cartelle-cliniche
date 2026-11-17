import {
  buildLines,
  extractLabResults,
  extractReport,
  GENERIC_PARSER,
  linesToText,
  parseItalianDate,
  type ExtractedReport,
  type LayoutLine,
  type PdfTextItem,
} from '@alby/pdf/parse';
import { pickReportTemplate, SCAN_PARSER_ID, type ReportDraftDTO, type ReportTemplateDTO, type ScanRegion } from '@alby/shared';
import { recognizeText } from '@infinitered/react-native-mlkit-text-recognition';

/**
 * Riconoscimento del testo SUL TELEFONO (Google ML Kit, modello incluso nell'app: niente rete, niente invio
 * a servizi esterni). Le parole riconosciute diventano gli stessi frammenti di testo che il server ricava
 * dai PDF, così i lettori dei referti (`@alby/pdf/parse`) si usano tali e quali.
 */

/** Le soglie dei lettori sono in punti PDF: la foto si riporta alla larghezza di un A4 (595 punti). */
const PAGE_WIDTH_PT = 595;

type Rows = ReportDraftDTO['values']['results'];

export interface PhotoText {
  /** Parole in punti, con la posizione nella pagina (per leggere anche solo una zona). */
  items: PdfTextItem[];
  width: number;
  height: number;
}

/** Riconosce tutto il testo della foto una volta sola: le zone si leggono poi filtrando, all'istante. */
export async function recognizePhoto(uri: string, imageWidth: number, imageHeight: number): Promise<PhotoText> {
  const found = await recognizeText(uri);
  const scale = imageWidth / PAGE_WIDTH_PT;
  const r = (n: number) => Math.round((n / scale) * 10) / 10;
  const items: PdfTextItem[] = [];
  for (const block of found.blocks) {
    for (const line of block.lines) {
      const lineHeight = line.frame.bottom - line.frame.top;
      for (const el of line.elements) {
        if (!el.text.trim()) continue;
        items.push({
          text: el.text,
          x: r(el.frame.left),
          // Come per l'OCR del server: la linea di base si stima dal fondo della riga.
          top: r(line.frame.bottom - lineHeight * 0.2),
          width: r(el.frame.right - el.frame.left),
          height: r(lineHeight * 0.8),
          font: 'ocr',
        });
      }
    }
  }
  return { items, width: PAGE_WIDTH_PT, height: r(imageHeight) };
}

/** Righe della pagina, o solo della zona (le parole con il centro dentro la zona). */
export function linesOf(photo: PhotoText, region?: ScanRegion): LayoutLine[] {
  const inside = (i: PdfTextItem) => {
    if (!region) return true;
    const cx = (i.x + i.width / 2) / photo.width;
    const cy = (i.top - i.height / 2) / photo.height;
    return cx >= region.x && cx <= region.x + region.width && cy >= region.y && cy <= region.y + region.height;
  };
  return buildLines({ pages: [{ number: 1, width: photo.width, height: photo.height, items: photo.items.filter(inside) }], info: {} });
}

export const DEVICE_PARSER = { id: SCAN_PARSER_ID, version: GENERIC_PARSER.versione };

function toRows(results: ExtractedReport['risultati']): Rows {
  return results.map((r) => ({
    section: r.sezione ?? '',
    name: r.nome,
    value: r.valore,
    unit: r.unita ?? '',
    referenceRange: r.riferimento ?? '',
    outOfRange: r.fuoriRange ?? null,
  }));
}

/** Tutta la foto letta come un referto: i campi proposti, come fa il server per la pagina intera. */
export function draftFromPhoto(photo: PhotoText, templates: readonly ReportTemplateDTO[], base: ReportDraftDTO['values']) {
  const extracted = extractReport(linesOf(photo));
  const isLab = extracted.tipo === 'laboratorio';
  const values: ReportDraftDTO['values'] = {
    ...base,
    templateId: pickReportTemplate(templates, isLab)?.id ?? base.templateId,
    title: extracted.titolo ?? (isLab ? 'Esami di laboratorio' : base.title),
    examDate: extracted.dataEsame ?? base.examDate,
    samplingDate: extracted.dataPrelievo ?? base.samplingDate,
    reportDate: extracted.dataReferto ?? base.reportDate,
    reportNumber: extracted.numeroReferto ?? base.reportNumber,
    doctor: extracted.medico ?? base.doctor,
    doctorRole: extracted.qualificaMedico ?? base.doctorRole,
    body: extracted.testo ?? base.body,
    results: toRows(extracted.risultati),
  };
  return { values, warnings: extracted.avvisi };
}

export type ZoneMode = 'table' | 'date' | 'line' | 'paragraph';

/** Testo di una zona per un campo (data, riga, testo lungo) o righe di valori per la tabella. */
export function readZone(photo: PhotoText, region: ScanRegion, mode: 'table'): Rows;
export function readZone(photo: PhotoText, region: ScanRegion, mode: Exclude<ZoneMode, 'table'>): string;
export function readZone(photo: PhotoText, region: ScanRegion, mode: ZoneMode): Rows | string {
  const lines = linesOf(photo, region);
  if (mode === 'table') return toRows(extractLabResults(lines));
  if (mode === 'paragraph') return linesToText(lines);
  const flat = lines
    .map((l) => l.cells.map((c) => c.text).join(' '))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return mode === 'date' ? (parseItalianDate(flat) ?? '') : flat;
}
