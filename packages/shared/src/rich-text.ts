/**
 * Testo formattato del referto, salvato come un piccolo sottoinsieme di Markdown: resta testo leggibile
 * (per l'app mobile, la ricerca, l'OCR, l'assistente IA) e i testi semplici già salvati restano validi.
 *
 *  - paragrafi separati da una riga vuota; un "a capo" semplice resta un a capo;
 *  - `### Titoletto` (anche `#` o `##`);
 *  - elenchi puntati (`- voce` o `* voce`) e numerati (`1. voce`); una riga rientrata di due spazi
 *    continua la voce precedente;
 *  - `**grassetto**`, `*corsivo*`, `++sottolineato++`, `~~barrato~~`;
 *  - `\` rende letterale il segno che segue (es. `\*`).
 *
 * Un segno senza il suo compagno resta testo. Nessun HTML: chi mostra il testo crea gli elementi da sé.
 */

export type RichMark = 'bold' | 'italic' | 'underline' | 'strike';
export type RichInline = { type: 'text'; text: string; marks: RichMark[] } | { type: 'break' };
export type RichBlock =
  | { type: 'paragraph'; content: RichInline[] }
  | { type: 'heading'; content: RichInline[] }
  | { type: 'bulletList'; items: RichInline[][] }
  | { type: 'orderedList'; items: RichInline[][] };

export const RICH_MARKS: readonly RichMark[] = ['bold', 'italic', 'underline', 'strike'];
const MARKERS: Record<RichMark, string> = { bold: '**', italic: '*', underline: '++', strike: '~~' };
const BY_MARKER: Record<string, RichMark> = { '**': 'bold', '*': 'italic', '++': 'underline', '~~': 'strike' };
const ESCAPABLE = new Set('\\*+~#-.)'.split(''));

const HEADING = /^#{1,3} +(.*)$/;
const BULLET = /^[-*] +(.*)$/;
const ORDERED = /^\d{1,3}[.)] +(.*)$/;
const CONTINUATION = /^ {2,}(\S.*)$/;

// ── Lettura ─────────────────────────────────────────────────────────────────────────────────────

type Token = { kind: 'text'; text: string } | { kind: 'marker'; marker: string; mark: RichMark; before: string; after: string };

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let text = '';
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (c === '\\' && i + 1 < src.length && ESCAPABLE.has(src[i + 1]!)) {
      text += src[++i];
      continue;
    }
    const two = src.slice(i, i + 2);
    const marker = two === '**' || two === '++' || two === '~~' ? two : c === '*' ? '*' : null;
    if (!marker) {
      text += c;
      continue;
    }
    if (text) tokens.push({ kind: 'text', text });
    text = '';
    tokens.push({ kind: 'marker', marker, mark: BY_MARKER[marker]!, before: src[i - 1] ?? ' ', after: src[i + marker.length] ?? ' ' });
    i += marker.length - 1;
  }
  if (text) tokens.push({ kind: 'text', text });
  return tokens;
}

/** Testo di una riga (o di più righe unite da `\n`) con i suoi segni. */
export function parseInline(src: string): RichInline[] {
  const tokens = tokenize(src);
  // Si accoppiano i segni: apre se seguito da un carattere visibile, chiude se preceduto da uno.
  const open = new Map<RichMark, number>();
  const paired = new Set<number>();
  tokens.forEach((t, i) => {
    if (t.kind !== 'marker') return;
    const start = open.get(t.mark);
    if (start !== undefined && /\S/.test(t.before)) {
      paired.add(start).add(i);
      open.delete(t.mark);
    } else if (start === undefined && /\S/.test(t.after)) {
      open.set(t.mark, i);
    }
  });

  const out: RichInline[] = [];
  const active = new Set<RichMark>();
  const push = (text: string) => {
    text.split('\n').forEach((part, k) => {
      if (k > 0) out.push({ type: 'break' });
      if (!part) return;
      const marks = RICH_MARKS.filter((m) => active.has(m));
      const prev = out.at(-1);
      if (prev?.type === 'text' && prev.marks.join() === marks.join()) prev.text += part;
      else out.push({ type: 'text', text: part, marks });
    });
  };
  tokens.forEach((t, i) => {
    if (t.kind === 'text') push(t.text);
    else if (!paired.has(i)) push(t.marker);
    else if (active.has(t.mark)) active.delete(t.mark);
    else active.add(t.mark);
  });
  return out;
}

export function parseRichText(src: string | null | undefined): RichBlock[] {
  const blocks: RichBlock[] = [];
  // Blocco in corso. Con `as`, TypeScript non lo considera sempre `null` (lo cambia anche `flush`).
  let paragraph = null as string[] | null;
  let list = null as { type: 'bulletList' | 'orderedList'; items: string[][] } | null;

  const flush = () => {
    if (paragraph) blocks.push({ type: 'paragraph', content: parseInline(paragraph.join('\n')) });
    if (list) blocks.push({ type: list.type, items: list.items.map((lines) => parseInline(lines.join('\n'))) });
    paragraph = null;
    list = null;
  };

  for (const raw of (src ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flush();
      continue;
    }
    const continuation = list && CONTINUATION.exec(line);
    if (list && continuation) {
      list.items.at(-1)!.push(continuation[1]!);
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      blocks.push({ type: 'heading', content: parseInline(heading[1]!) });
      continue;
    }
    const bullet = BULLET.exec(line);
    const ordered = !bullet && ORDERED.exec(line);
    const item = bullet ?? ordered;
    if (item) {
      const type = bullet ? 'bulletList' : 'orderedList';
      if (list?.type !== type) {
        flush();
        list = { type, items: [] };
      }
      list.items.push([item[1]!]);
      continue;
    }
    if (list) flush();
    (paragraph ??= []).push(line.trimStart());
  }
  flush();
  return blocks.filter((b) => ('content' in b ? b.content.length > 0 : b.items.length > 0));
}

// ── Scrittura ───────────────────────────────────────────────────────────────────────────────────

/** Rende letterali i segni del formato (per inserire testo semplice, es. letto con l'OCR). */
export function escapeRichText(text: string): string {
  return text
    .replace(/[\\*]/g, '\\$&')
    .replace(/\+\+/g, '\\++')
    .replace(/~~/g, '\\~~')
    .split('\n')
    .map((line) => line.replace(/^(\s*)(#|-|\d{1,3}(?=[.)] ))/, (_, space: string, sign: string) => (/\d/.test(sign) ? `${space}${sign}\\` : `${space}\\${sign}`)))
    .join('\n');
}

function serializeInline(content: RichInline[], { breaks = '\n' } = {}): string {
  let out = '';
  for (const node of content) {
    if (node.type === 'break') {
      out += breaks;
      continue;
    }
    // Gli spazi ai bordi restano fuori dai segni (altrimenti non si riconoscerebbero più).
    const [, lead, body, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(node.text)!;
    if (!body) {
      out += node.text;
      continue;
    }
    const open = RICH_MARKS.filter((m) => node.marks.includes(m)).map((m) => MARKERS[m]).join('');
    const close = [...open.matchAll(/\*\*|\+\+|~~|\*/g)].map((m) => m[0]).reverse().join('');
    out += `${lead}${open}${escapeRichText(body!)}${close}${trail}`;
  }
  return out;
}

export function serializeRichText(blocks: RichBlock[]): string {
  return blocks
    .map((b) => {
      if (!('items' in b)) return b.type === 'heading' ? `### ${serializeInline(b.content, { breaks: ' ' })}` : serializeInline(b.content);
      return b.items.map((item, i) => `${b.type === 'bulletList' ? '-' : `${i + 1}.`} ${serializeInline(item, { breaks: '\n   ' })}`).join('\n');
    })
    .filter((s) => s.trim())
    .join('\n\n');
}

/** Il testo senza formattazione (es. per anteprime e ricerche). */
export function richTextToPlain(src: string | null | undefined): string {
  const inline = (content: RichInline[]) => content.map((n) => (n.type === 'break' ? '\n' : n.text)).join('');
  return parseRichText(src)
    .map((b) =>
      'content' in b ? inline(b.content) : b.items.map((item, i) => `${b.type === 'bulletList' ? '•' : `${i + 1}.`} ${inline(item)}`).join('\n'),
    )
    .join('\n\n');
}
