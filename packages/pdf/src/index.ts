export { extractPdf, NoTextLayerError, type PdfDocument, type PdfPage, type PdfTextItem } from './extract';
export { buildLines, type LayoutCell, type LayoutLine } from './layout';
export { parseLayoutText } from './layout-text';
export { anonymizeLines, collectNames, formatLayout, type AnonymizeOptions, type AnonymizeStats } from './anonymize';
export {
  extractLabResults,
  extractReport,
  GENERIC_PARSER,
  linesToText,
  parseItalianDate,
  type ExtractedReport,
  type LabResult,
} from './report';
export { renderTherapyPdf, type TherapySheet } from './therapy';
export { renderRecordPdf, type RecordBlock, type RecordDocument, type RecordSection, type RecordTableRow } from './record';
// Rilanciate da @alby/shared per comodità (sono usate anche nel browser).
export { isOutOfRange, parseItalianNumber } from '@alby/shared';
