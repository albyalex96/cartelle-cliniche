import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { textCleaner, wrapText } from './text';

/**
 * PDF "Cartella clinica": il riepilogo di tutto ciò che è registrato per un paziente (anagrafica, terapie,
 * referti con i loro valori, immagini) in un periodo. Il contenuto arriva già pronto e in formato leggibile:
 * qui si impagina soltanto, a sezioni, su fogli A4.
 */
export interface RecordDocument {
  patientName: string;
  /** Sotto il nome: periodo, data di stampa… (già in formato leggibile). */
  subtitle: string;
  sections: RecordSection[];
}

export interface RecordSection {
  title: string;
  blocks: RecordBlock[];
}

export type RecordBlock =
  /** Titolo di una voce della sezione (es. un referto), con una riga grigia sotto. */
  | { type: 'heading'; text: string; sub?: string }
  /** Coppie etichetta: valore, una per riga. */
  | { type: 'fields'; items: { label: string; value: string }[] }
  /** Testo libero: i ritorni a capo vengono mantenuti. */
  | { type: 'text'; label?: string; text: string }
  /** Tabella: `width` è la frazione della larghezza della pagina. */
  | { type: 'table'; label?: string; columns: { title: string; width: number }[]; rows: RecordTableRow[] }
  /** Testo grigio (es. "Nessun referto nel periodo"). */
  | { type: 'note'; text: string };

export interface RecordTableRow {
  cells: string[];
  /** Riga di intestazione di un gruppo (es. "Emocromo"): una sola cella su tutta la larghezza. */
  group?: boolean;
  /** Riga da evidenziare (valore fuori dai valori di riferimento). */
  flagged?: boolean;
}

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 48;
const BOTTOM = MARGIN + 20;
const INNER = A4.width - MARGIN * 2;
const LABEL_WIDTH = 140;
const PAD = 4;
const GRAY = rgb(0.4, 0.4, 0.4);
const LINE = rgb(0.82, 0.82, 0.82);
const RED = rgb(0.7, 0.1, 0.1);

export async function renderRecordPdf(doc: RecordDocument): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Cartella clinica - ${doc.patientName}`);
  pdf.setLanguage('it-IT');
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const clean = textCleaner(regular);
  const wrap = (text: string, font: PDFFont, size: number, width: number) => wrapText(clean(text), font, size, width);

  let page!: PDFPage;
  let y = 0;
  const newPage = () => {
    page = pdf.addPage([A4.width, A4.height]);
    y = A4.height - MARGIN;
  };
  /** Va a una pagina nuova se qui non ci stanno `height` punti. */
  const ensure = (height: number) => {
    if (y - height < BOTTOM) newPage();
  };
  const lines = (list: string[], x: number, size: number, font: PDFFont, color = rgb(0, 0, 0), leading = size + 3) => {
    for (const l of list) {
      ensure(leading);
      page.drawText(l, { x, y: y - size, size, font, color });
      y -= leading;
    }
  };

  newPage();
  page.drawText('Cartella clinica', { x: MARGIN, y: y - 20, size: 20, font: bold });
  y -= 42;
  lines(wrap(doc.patientName, bold, 13, INNER), MARGIN, 13, bold);
  y -= 2;
  lines(wrap(doc.subtitle, regular, 10, INNER), MARGIN, 10, regular, GRAY);
  y -= 8;

  const label = (text: string) => {
    ensure(30);
    lines(wrap(text.toUpperCase(), bold, 8, INNER), MARGIN, 8, bold, GRAY, 12);
    y -= 2;
  };

  const table = (block: Extract<RecordBlock, { type: 'table' }>) => {
    if (block.label) label(block.label);
    const total = block.columns.reduce((n, c) => n + c.width, 0);
    const widths = block.columns.map((c) => (INNER * c.width) / total);
    const xs = widths.map((_, i) => MARGIN + widths.slice(0, i).reduce((n, w) => n + w, 0));
    const header = () => {
      block.columns.forEach((c, i) => page.drawText(clean(c.title), { x: xs[i]! + PAD, y: y - 9, size: 8, font: bold, color: GRAY }));
      y -= 14;
      page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + INNER, y }, thickness: 0.8, color: GRAY });
    };
    ensure(40);
    header();
    for (const row of block.rows) {
      const font = row.group || row.flagged ? bold : regular;
      const cells = row.group ? [wrap(row.cells[0] ?? '', bold, 9, INNER - PAD * 2)] : row.cells.map((c, i) => wrap(c || '—', font, 9, widths[i]! - PAD * 2));
      const height = Math.max(...cells.map((c) => c.length)) * 11 + PAD * 2;
      if (y - height < BOTTOM) {
        newPage();
        header();
      }
      cells.forEach((cell, i) =>
        cell.forEach((l, n) =>
          page.drawText(l, { x: xs[i]! + PAD, y: y - PAD - 8 - n * 11, size: 9, font, color: row.flagged && i > 0 ? RED : rgb(0, 0, 0) }),
        ),
      );
      y -= height;
      page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + INNER, y }, thickness: 0.4, color: LINE });
    }
  };

  for (const section of doc.sections) {
    ensure(80);
    y -= 10;
    page.drawText(clean(section.title), { x: MARGIN, y: y - 14, size: 14, font: bold });
    y -= 20;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + INNER, y }, thickness: 1, color: GRAY });
    y -= 10;

    for (const [i, block] of section.blocks.entries()) {
      if (block.type === 'heading') {
        if (i > 0) {
          // Separatore tra una voce e l'altra.
          ensure(70);
          y -= 4;
          page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + INNER, y }, thickness: 0.4, color: LINE });
          y -= 10;
        }
        ensure(60);
        lines(wrap(block.text, bold, 11.5, INNER), MARGIN, 11.5, bold);
        if (block.sub) lines(wrap(block.sub, regular, 9, INNER), MARGIN, 9, regular, GRAY);
        y -= 6;
      } else if (block.type === 'fields') {
        for (const item of block.items) {
          const name = wrap(item.label, bold, 9, LABEL_WIDTH - 8);
          const value = wrap(item.value, regular, 10, INNER - LABEL_WIDTH);
          const height = Math.max(name.length * 12, value.length * 13) + 3;
          ensure(height);
          name.forEach((l, n) => page.drawText(l, { x: MARGIN, y: y - 10 - n * 12, size: 9, font: bold, color: GRAY }));
          value.forEach((l, n) => page.drawText(l, { x: MARGIN + LABEL_WIDTH, y: y - 10 - n * 13, size: 10, font: regular }));
          y -= height;
        }
        y -= 6;
      } else if (block.type === 'text') {
        if (block.label) label(block.label);
        for (const paragraph of block.text.replace(/\r\n?/g, '\n').split('\n')) {
          if (!paragraph.trim()) y -= 6;
          else lines(wrap(paragraph, regular, 10, INNER), MARGIN, 10, regular);
        }
        y -= 8;
      } else if (block.type === 'table') {
        table(block);
        y -= 10;
      } else {
        lines(wrap(block.text, regular, 10, INNER), MARGIN, 10, regular, GRAY);
        y -= 6;
      }
    }
  }

  // In fondo a ogni foglio: di chi è la cartella e il numero di pagina.
  const pages = pdf.getPages();
  const owner = clean(`Cartella clinica - ${doc.patientName}`);
  pages.forEach((p, i) => {
    const number = `Pagina ${i + 1} di ${pages.length}`;
    p.drawText(owner, { x: MARGIN, y: MARGIN - 18, size: 8, font: regular, color: GRAY });
    p.drawText(number, { x: A4.width - MARGIN - regular.widthOfTextAtSize(number, 8), y: MARGIN - 18, size: 8, font: regular, color: GRAY });
  });
  return pdf.save();
}
