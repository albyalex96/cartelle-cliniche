import type { PDFFont } from 'pdf-lib';

/**
 * Testo per i PDF generati con i caratteri standard (Helvetica): coprono l'alfabeto latino con gli accenti,
 * il resto diventa "?". Spazi e ritorni a capo vengono ridotti a uno spazio.
 */
export function textCleaner(font: PDFFont): (text: string) => string {
  const known = new Set(font.getCharacterSet());
  return (text) => Array.from(text.replace(/\s+/g, ' ').trim(), (c) => (known.has(c.codePointAt(0)!) ? c : '?')).join('');
}

/** Divide un testo (già ripulito) in righe che stanno nella larghezza data; le parole troppo lunghe vengono spezzate. */
export function wrapText(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (let word of text.split(' ')) {
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
}
