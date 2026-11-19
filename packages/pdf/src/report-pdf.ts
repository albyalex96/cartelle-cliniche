import { PDFDocument, StandardFonts, rgb, type Color, type PDFFont, type PDFPage } from 'pdf-lib';
import type { RecordBlock } from './record';
import { textCleaner, wrapText } from './text';

/**
 * PDF di un singolo referto, da stampare o condividere: intestazione con tipo, titolo e data dell'esame,
 * scheda del paziente, riepilogo dei valori e contenuto (campi, testi, tabella dei valori con i fuori range
 * evidenziati). Il contenuto arriva già pronto e leggibile (stessi blocchi della cartella clinica): qui si
 * impagina soltanto, su fogli A4.
 */
export interface ReportPdfDocument {
  title: string;
  /** Tipo di referto (es. "Analisi del sangue"). */
  kind: string;
  /** AAAA-MM-GG */
  examDate: string;
  facility: string | null;
  patient: { name: string; items: { label: string; value: string }[] };
  summary: { results: number; outOfRange: number };
  /** Campi, testi e tabelle (i titoli `heading` vengono ignorati: il titolo è nell'intestazione). */
  blocks: RecordBlock[];
  /** Data e ora di creazione del PDF, già leggibili. */
  generatedAt: string;
}

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 50;
const BOTTOM = MARGIN + 28;
const INNER = A4.width - MARGIN * 2;
/** Spazio scrivibile di una pagina successiva alla prima (sotto la riga di intestazione). */
const PAGE_SPACE = A4.height - MARGIN - 30 - BOTTOM;

const INK = rgb(0.09, 0.12, 0.16);
const MUTED = rgb(0.42, 0.47, 0.53);
const LINE = rgb(0.87, 0.89, 0.92);
const PANEL = rgb(0.965, 0.972, 0.982);
const ACCENT = rgb(0.12, 0.44, 0.92);
const ACCENT_SOFT = rgb(0.91, 0.94, 0.99);
const RED = rgb(0.76, 0.13, 0.13);
const RED_SOFT = rgb(0.99, 0.93, 0.93);
const GREEN = rgb(0.08, 0.5, 0.29);
const GREEN_SOFT = rgb(0.91, 0.97, 0.93);
const ZEBRA = rgb(0.978, 0.982, 0.988);
const GROUP = rgb(0.94, 0.95, 0.965);

const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

export async function renderReportPdf(doc: ReportPdfDocument): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${doc.title} - ${doc.patient.name}`);
  pdf.setSubject(doc.kind);
  pdf.setLanguage('it-IT');
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const clean = textCleaner(regular);
  const wrap = (text: string, font: PDFFont, size: number, width: number) => wrapText(clean(text), font, size, width);
  const widthOf = (text: string, font: PDFFont, size: number) => font.widthOfTextAtSize(clean(text), size);

  let page!: PDFPage;
  let y = 0;

  const roundRect = (x: number, top: number, w: number, h: number, r: number, fill: Color, border?: Color) =>
    page.drawSvgPath(`M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`, {
      x,
      y: top,
      color: fill,
      ...(border ? { borderColor: border, borderWidth: 0.6 } : {}),
    });
  const text = (value: string, x: number, baseline: number, size: number, font: PDFFont, color: Color = INK) =>
    page.drawText(clean(value), { x, y: baseline, size, font, color });

  /** Pagine successive alla prima: una riga di intestazione con titolo e paziente. */
  const newPage = (first = false) => {
    page = pdf.addPage([A4.width, A4.height]);
    page.drawRectangle({ x: 0, y: A4.height - 6, width: A4.width, height: 6, color: ACCENT });
    y = A4.height - MARGIN;
    if (first) return;
    const head = wrap(`${doc.title}  |  ${doc.patient.name}`, regular, 8, INNER)[0] ?? '';
    page.drawText(head, { x: MARGIN, y: y - 8, size: 8, font: regular, color: MUTED });
    y -= 16;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + INNER, y }, thickness: 0.5, color: LINE });
    y -= 14;
  };
  const ensure = (height: number) => {
    if (y - height < BOTTOM) newPage();
  };

  // ---------------------------------------------------------------- intestazione
  newPage(true);
  const DATE_W = 92;
  const DATE_H = 70;
  const headTop = y;
  const textWidth = INNER - DATE_W - 20;

  text('REFERTO', MARGIN, y - 8, 8, bold, ACCENT);
  const kindX = MARGIN + widthOf('REFERTO', bold, 8) + 10;
  page.drawCircle({ x: kindX - 5, y: y - 5.2, size: 1.3, color: MUTED });
  for (const [i, l] of wrap(doc.kind.toUpperCase(), bold, 8, textWidth - (kindX - MARGIN)).entries()) text(l, kindX, y - 8 - i * 11, 8, bold, MUTED);
  y -= 26;
  for (const l of wrap(doc.title, bold, 21, textWidth)) {
    text(l, MARGIN, y - 18, 21, bold);
    y -= 25;
  }
  if (doc.facility) {
    y -= 2;
    for (const l of wrap(doc.facility, regular, 10.5, textWidth)) {
      text(l, MARGIN, y - 10, 10.5, regular, MUTED);
      y -= 14;
    }
  }

  // Riquadro della data, a destra.
  const [yy, mm, dd] = doc.examDate.split('-');
  const boxX = MARGIN + INNER - DATE_W;
  roundRect(boxX, headTop, DATE_W, DATE_H, 10, ACCENT_SOFT);
  const centered = (value: string, baseline: number, size: number, font: PDFFont, color: Color) =>
    text(value, boxX + (DATE_W - widthOf(value, font, size)) / 2, baseline, size, font, color);
  centered('DATA ESAME', headTop - 15, 6.5, bold, ACCENT);
  centered(String(Number(dd)), headTop - 43, 26, bold, INK);
  centered(`${MONTHS[Number(mm) - 1] ?? ''} ${yy}`, headTop - 58, 9, regular, MUTED);

  y = Math.min(y, headTop - DATE_H) - 20;

  // ---------------------------------------------------------------- paziente
  const items = doc.patient.items.filter((i) => i.value);
  const COLS = 3;
  const colW = (INNER - 28) / COLS;
  const rowsOfItems = Math.ceil(items.length / COLS);
  const cardH = 44 + rowsOfItems * 30;
  roundRect(MARGIN, y, INNER, cardH, 10, PANEL, LINE);
  page.drawRectangle({ x: MARGIN, y: y - cardH + 10, width: 3, height: cardH - 20, color: ACCENT });
  text('PAZIENTE', MARGIN + 16, y - 18, 7, bold, MUTED);
  text(wrap(doc.patient.name, bold, 14, INNER - 32)[0] ?? '', MARGIN + 16, y - 36, 14, bold);
  items.forEach((item, i) => {
    const x = MARGIN + 16 + (i % COLS) * colW;
    const top = y - 50 - Math.floor(i / COLS) * 30;
    text(item.label.toUpperCase(), x, top - 7, 6.5, bold, MUTED);
    text(wrap(item.value, regular, 10, colW - 10)[0] ?? '', x, top - 20, 10, regular);
  });
  y -= cardH + 16;

  // ---------------------------------------------------------------- riepilogo dei valori
  const pill = (label: string, x: number, fill: Color, color: Color) => {
    const w = widthOf(label, bold, 8.5) + 22;
    roundRect(x, y, w, 20, 10, fill);
    page.drawCircle({ x: x + 10, y: y - 10, size: 2.2, color });
    text(label, x + 16, y - 13, 8.5, bold, color);
    return x + w + 8;
  };
  if (doc.summary.results > 0) {
    const x = pill(doc.summary.results === 1 ? '1 valore' : `${doc.summary.results} valori`, MARGIN, ACCENT_SOFT, ACCENT);
    if (doc.summary.outOfRange > 0)
      pill(doc.summary.outOfRange === 1 ? '1 fuori dai valori di riferimento' : `${doc.summary.outOfRange} fuori dai valori di riferimento`, x, RED_SOFT, RED);
    else pill('Tutti nei valori di riferimento', x, GREEN_SOFT, GREEN);
    y -= 36;
  }

  // ---------------------------------------------------------------- contenuto
  const sectionLabel = (label: string) => {
    ensure(44);
    page.drawRectangle({ x: MARGIN, y: y - 10, width: 3, height: 10, color: ACCENT });
    text(wrap(label.toUpperCase(), bold, 8.5, INNER - 12)[0] ?? '', MARGIN + 10, y - 8.5, 8.5, bold);
    y -= 16;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + INNER, y }, thickness: 0.5, color: LINE });
    y -= 10;
  };

  const fields = (list: { label: string; value: string }[]) => {
    sectionLabel('Dati del referto');
    const half = (INNER - 24) / 2;
    for (let i = 0; i < list.length; i += 2) {
      const pair = list.slice(i, i + 2).map((f) => ({ label: wrap(f.label.toUpperCase(), bold, 6.8, half), value: wrap(f.value, regular, 10, half) }));
      const height = Math.max(...pair.map((p) => p.label.length * 9 + p.value.length * 13)) + 10;
      ensure(height);
      pair.forEach((p, c) => {
        const x = MARGIN + c * (half + 24);
        let ly = y;
        for (const l of p.label) {
          page.drawText(l, { x, y: ly - 7, size: 6.8, font: bold, color: MUTED });
          ly -= 9;
        }
        ly -= 2;
        for (const l of p.value) {
          page.drawText(l, { x, y: ly - 10, size: 10, font: regular, color: INK });
          ly -= 13;
        }
      });
      y -= height;
    }
    y -= 8;
  };

  const paragraphs = (block: Extract<RecordBlock, { type: 'text' }>) => {
    // Etichetta e testo restano insieme: se non ci stanno qui vanno alla pagina dopo. Solo un testo più
    // lungo di una pagina intera si divide (con l'etichetta comunque attaccata alle prime righe).
    const list = block.text
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map((p) => (p.trim() ? wrap(p, regular, 10, INNER) : null));
    const LABEL_H = 26;
    const height = LABEL_H + list.reduce((n, p) => n + (p ? p.length * 14.5 : 6), 0);
    ensure(height <= PAGE_SPACE ? height : LABEL_H + 3 * 14.5);
    sectionLabel(block.label ?? 'Testo');
    for (const p of list) {
      if (!p) {
        y -= 6;
        continue;
      }
      for (const l of p) {
        ensure(14);
        page.drawText(l, { x: MARGIN, y: y - 10, size: 10, font: regular, color: INK });
        y -= 14.5;
      }
    }
    y -= 12;
  };

  const table = (block: Extract<RecordBlock, { type: 'table' }>) => {
    sectionLabel(block.label ?? 'Valori');
    const PAD = 6;
    const total = block.columns.reduce((n, c) => n + c.width, 0);
    const widths = block.columns.map((c) => (INNER * c.width) / total);
    const xs = widths.map((_, i) => MARGIN + widths.slice(0, i).reduce((n, w) => n + w, 0));
    const header = () => {
      roundRect(MARGIN, y, INNER, 20, 5, ACCENT_SOFT);
      block.columns.forEach((c, i) => page.drawText(clean(c.title.toUpperCase()), { x: xs[i]! + PAD + (i === 0 ? 6 : 0), y: y - 13, size: 7, font: bold, color: ACCENT }));
      y -= 22;
    };
    ensure(60);
    header();
    let zebra = false;
    for (const row of block.rows) {
      const flagged = !!row.flagged;
      const cells = row.group
        ? [wrap(row.cells[0] ?? '', bold, 8.5, INNER - PAD * 2)]
        : row.cells.map((c, i) => wrap(c || '—', i === 1 || flagged ? bold : regular, 9, widths[i]! - PAD * 2 - (i === 0 ? 6 : 0)));
      const height = Math.max(...cells.map((c) => c.length)) * 11 + PAD * 2 - 1;
      if (y - height < BOTTOM) {
        newPage();
        header();
      }
      if (row.group) {
        page.drawRectangle({ x: MARGIN, y: y - height, width: INNER, height, color: GROUP });
        cells[0]!.forEach((l, n) => page.drawText(l, { x: MARGIN + PAD + 6, y: y - PAD - 7.5 - n * 11, size: 8.5, font: bold, color: INK }));
        zebra = false;
      } else {
        if (flagged) page.drawRectangle({ x: MARGIN, y: y - height, width: INNER, height, color: RED_SOFT });
        else if (zebra) page.drawRectangle({ x: MARGIN, y: y - height, width: INNER, height, color: ZEBRA });
        if (flagged) page.drawCircle({ x: MARGIN + 6, y: y - PAD - 4.5, size: 2.2, color: RED });
        cells.forEach((cell, i) =>
          cell.forEach((l, n) =>
            page.drawText(l, {
              x: xs[i]! + PAD + (i === 0 ? 6 : 0),
              y: y - PAD - 8 - n * 11,
              size: 9,
              font: i === 1 || flagged ? bold : regular,
              color: flagged && i > 0 ? RED : i >= 2 ? MUTED : INK,
            }),
          ),
        );
        zebra = !zebra;
      }
      y -= height;
    }
    page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + INNER, y }, thickness: 0.5, color: LINE });
    y -= 18;
  };

  for (const block of doc.blocks) {
    if (block.type === 'heading') continue;
    if (block.type === 'fields') fields(block.items);
    else if (block.type === 'text') paragraphs(block);
    else if (block.type === 'table') table(block);
    else {
      for (const l of wrap(block.text, regular, 10, INNER)) {
        ensure(14);
        page.drawText(l, { x: MARGIN, y: y - 10, size: 10, font: regular, color: MUTED });
        y -= 14;
      }
      y -= 8;
    }
  }

  // ---------------------------------------------------------------- piè di pagina
  const pages = pdf.getPages();
  const owner = wrap(`${doc.patient.name}  |  ${doc.title}`, regular, 7.5, INNER - 90)[0] ?? '';
  const generated = clean(`Documento generato il ${doc.generatedAt}. Non sostituisce il referto originale firmato.`);
  pages.forEach((p, i) => {
    const number = `${i + 1} / ${pages.length}`;
    p.drawLine({ start: { x: MARGIN, y: MARGIN - 4 }, end: { x: MARGIN + INNER, y: MARGIN - 4 }, thickness: 0.5, color: LINE });
    p.drawText(owner, { x: MARGIN, y: MARGIN - 16, size: 7.5, font: bold, color: MUTED });
    p.drawText(generated, { x: MARGIN, y: MARGIN - 26, size: 6.5, font: regular, color: MUTED });
    p.drawText(number, { x: A4.width - MARGIN - bold.widthOfTextAtSize(number, 8), y: MARGIN - 16, size: 8, font: bold, color: ACCENT });
  });
  return pdf.save();
}
