/**
 * Solo i lettori dei referti (righe e colonne → campi e valori), senza pdfjs, canvas né OCR:
 * codice puro, usabile anche nell'app mobile, che li applica al testo riconosciuto sul telefono.
 * Qui si importano solo tipi da `extract` (spariscono alla compilazione).
 */
export type { PdfDocument, PdfPage, PdfTextItem } from './extract';
export { buildLines, type LayoutCell, type LayoutLine } from './layout';
export {
  extractLabResults,
  extractReport,
  GENERIC_PARSER,
  linesToText,
  parseItalianDate,
  type ExtractedReport,
  type LabResult,
} from './report';
