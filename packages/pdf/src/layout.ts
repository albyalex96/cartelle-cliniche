import type { PdfDocument, PdfTextItem } from './extract';

/** Blocco di testo contiguo su una riga (di solito: una "cella" di tabella). */
export interface LayoutCell {
  text: string;
  x: number;
  /** Bordo destro: utile per riconoscere colonne allineate a destra (i valori numerici). */
  right: number;
  height: number;
}

export interface LayoutLine {
  page: number;
  top: number;
  cells: LayoutCell[];
  /** Testo dell'intera riga, celle separate da " | ". */
  text: string;
}

/**
 * Ricostruisce righe e colonne dai frammenti del PDF.
 * I PDF non hanno il concetto di "tabella": ci sono solo pezzi di testo posizionati.
 * Due frammenti stanno sulla stessa riga se sono quasi alla stessa altezza; sulla stessa
 * riga, uno spazio ampio tra due frammenti indica una nuova colonna.
 */
export function buildLines(doc: PdfDocument): LayoutLine[] {
  const lines: LayoutLine[] = [];
  for (const page of doc.pages) {
    const sorted = [...page.items].sort((a, b) => a.top - b.top || a.x - b.x);
    const rows: PdfTextItem[][] = [];
    for (const item of sorted) {
      const row = rows.at(-1);
      const tolerance = Math.max(2, item.height * 0.45);
      if (row && Math.abs(row[0]!.top - item.top) <= tolerance) row.push(item);
      else rows.push([item]);
    }

    for (const row of rows) {
      row.sort((a, b) => a.x - b.x);
      const cells: LayoutCell[] = [];
      for (const item of row) {
        const prev = cells.at(-1);
        const charWidth = item.text.length ? item.width / item.text.length : item.height * 0.5;
        const gap = prev ? item.x - prev.right : Infinity;
        // Spazio piccolo = stessa cella (parole della stessa frase); spazio ampio = nuova colonna.
        if (prev && gap < Math.max(charWidth * 1.8, 4)) {
          prev.text += (gap > charWidth * 0.25 && !prev.text.endsWith(' ') ? ' ' : '') + item.text;
          prev.right = Math.max(prev.right, item.x + item.width);
        } else {
          cells.push({ text: item.text, x: item.x, right: item.x + item.width, height: item.height });
        }
      }
      for (const c of cells) {
        c.text = c.text.replace(/\s+/g, ' ').trim();
        c.right = Math.round(c.right * 10) / 10;
      }
      const kept = cells.filter((c) => c.text);
      if (kept.length) {
        lines.push({ page: page.number, top: row[0]!.top, cells: kept, text: kept.map((c) => c.text).join(' | ') });
      }
    }
  }
  return lines;
}
