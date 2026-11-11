import type { LayoutLine } from './layout';

/**
 * Rilegge il formato testuale prodotto da `formatLayout` (i referti anonimizzati) e lo
 * riconverte in righe e celle. Serve a provare gli estrattori sui referti anonimi,
 * senza dover riaprire i PDF originali.
 */
export function parseLayoutText(text: string): LayoutLine[] {
  const lines: LayoutLine[] = [];
  let page = 1;
  for (const raw of text.split(/\r?\n/)) {
    const p = /^=== Pagina (\d+)/.exec(raw);
    if (p) {
      page = Number(p[1]);
      continue;
    }
    const m = /^\[\s*(\d+)\]\s+(.*)$/.exec(raw);
    if (!m) continue;
    const cells = [...m[2]!.matchAll(/@\s*(\d+)  (.*?)(?=\s{4}@\s*\d+  |$)/g)].map((c) => ({
      text: c[2]!.trim(),
      x: Number(c[1]),
      right: Number(c[1]) + c[2]!.trim().length * 5,
      height: 10,
    }));
    if (cells.length) lines.push({ page, top: Number(m[1]), cells, text: cells.map((c) => c.text).join(' | ') });
  }
  return lines;
}
