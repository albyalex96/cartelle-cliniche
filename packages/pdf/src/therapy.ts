import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

/**
 * PDF "Terapie in corso": l'elenco dei farmaci da portare con sé (dal medico, in farmacia, al pronto soccorso).
 * Foglio A4 con una tabella: farmaco (con dosaggio e formulazione), dose, frequenza.
 */
export interface TherapySheet {
  patientName: string;
  /** Già in formato leggibile (es. "03/11/1958"). */
  birthDate?: string | null;
  /** Data di stampa, già in formato leggibile. */
  printedOn: string;
  items: {
    name: string;
    activeIngredient?: string | null;
    /** Dosaggio della confezione ("500 mg"): accanto al nome. */
    strength?: string | null;
    /** Formulazione ("Compressa"): sotto il nome. */
    form?: string | null;
    /** Quanto ne prende ("1 compressa"). */
    dosage?: string | null;
    frequency?: string | null;
    asNeeded?: boolean;
  }[];
}

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 48;
const COLUMNS = [
  { title: 'Farmaco', width: 0.44 },
  { title: 'Dose', width: 0.2 },
  { title: 'Frequenza', width: 0.36 },
] as const;
const GRAY = rgb(0.4, 0.4, 0.4);
const LINE = rgb(0.82, 0.82, 0.82);

export async function renderTherapyPdf(sheet: TherapySheet): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle('Terapie in corso');
  pdf.setLanguage('it-IT');
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  // I caratteri standard del PDF coprono l'alfabeto latino con gli accenti: il resto diventa "?".
  const known = new Set(regular.getCharacterSet());
  const clean = (s: string) =>
    Array.from(s.replace(/\s+/g, ' ').trim(), (c) => (known.has(c.codePointAt(0)!) ? c : '?')).join('');

  /** Divide il testo in righe che stanno nella larghezza data (le parole troppo lunghe vengono spezzate). */
  const wrap = (text: string, font: PDFFont, size: number, width: number): string[] => {
    const lines: string[] = [];
    let line = '';
    for (let word of clean(text).split(' ')) {
      while (font.widthOfTextAtSize(word, size) > width) {
        let n = word.length - 1;
        while (n > 1 && font.widthOfTextAtSize(word.slice(0, n), size) > width) n--;
        if (line) lines.push(line);
        lines.push(word.slice(0, n));
        line = '';
        word = word.slice(n);
      }
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > width) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
    return lines;
  };

  const inner = A4.width - MARGIN * 2;
  const pad = 6;
  const xs = COLUMNS.map((_, i) => MARGIN + inner * COLUMNS.slice(0, i).reduce((n, c) => n + c.width, 0));
  const widths = COLUMNS.map((c) => inner * c.width - pad * 2);

  let page!: PDFPage;
  let y = 0;
  const tableHeader = () => {
    COLUMNS.forEach((c, i) => page.drawText(c.title, { x: xs[i]! + pad, y: y - 11, size: 9, font: bold, color: GRAY }));
    y -= 18;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + inner, y }, thickness: 1, color: GRAY });
  };
  const newPage = (first: boolean) => {
    page = pdf.addPage([A4.width, A4.height]);
    y = A4.height - MARGIN;
    if (first) {
      page.drawText('Terapie in corso', { x: MARGIN, y: y - 20, size: 20, font: bold });
      y -= 42;
      page.drawText(clean(sheet.patientName), { x: MARGIN, y, size: 13, font: bold });
      y -= 16;
      const sub = [sheet.birthDate && `Nato/a il ${sheet.birthDate}`, `Elenco aggiornato al ${sheet.printedOn}`].filter(Boolean).join('  ·  ');
      page.drawText(clean(sub), { x: MARGIN, y, size: 10, font: regular, color: GRAY });
      y -= 22;
    }
    tableHeader();
  };
  newPage(true);

  if (sheet.items.length === 0) {
    page.drawText('Nessuna terapia in corso.', { x: MARGIN + pad, y: y - 20, size: 11, font: regular, color: GRAY });
  }
  for (const item of sheet.items) {
    const name = wrap([item.name, item.strength].filter(Boolean).join(' '), bold, 11, widths[0]!);
    const details = [item.form, item.activeIngredient].filter(Boolean).join(' · ');
    const ingredient = details ? wrap(details, regular, 9, widths[0]!) : [];
    const dosage = wrap(item.dosage || '—', regular, 11, widths[1]!);
    const frequency = wrap(item.frequency || (item.asNeeded ? '' : '—'), regular, 11, widths[2]!);
    if (item.asNeeded) frequency.push('Al bisogno');
    const height = Math.max(name.length * 14 + ingredient.length * 11, dosage.length * 14, frequency.length * 14) + pad * 2;
    if (y - height < MARGIN + 20) newPage(false);

    let ty = y - pad - 10;
    for (const l of name) {
      page.drawText(l, { x: xs[0]! + pad, y: ty, size: 11, font: bold });
      ty -= 14;
    }
    for (const l of ingredient) {
      page.drawText(l, { x: xs[0]! + pad, y: ty + 2, size: 9, font: regular, color: GRAY });
      ty -= 11;
    }
    dosage.forEach((l, i) => page.drawText(l, { x: xs[1]! + pad, y: y - pad - 10 - i * 14, size: 11, font: regular }));
    frequency.forEach((l, i) => page.drawText(l, { x: xs[2]! + pad, y: y - pad - 10 - i * 14, size: 11, font: regular }));
    y -= height;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + inner, y }, thickness: 0.5, color: LINE });
  }

  // Numero di pagina in fondo a ogni foglio.
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    const label = `Pagina ${i + 1} di ${pages.length}`;
    p.drawText(label, { x: A4.width - MARGIN - regular.widthOfTextAtSize(label, 8), y: MARGIN - 18, size: 8, font: regular, color: GRAY });
  });
  return pdf.save();
}
