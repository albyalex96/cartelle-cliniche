import { inflateRawSync } from 'node:zlib';
import { AppError } from './errors';

/**
 * Lettura essenziale di un file Excel (.xlsx): solo il testo delle celle, foglio per foglio.
 * Un .xlsx è un archivio ZIP di file XML: bastano zlib e poche espressioni regolari, nessuna libreria.
 */

/** Limite sul contenuto decompresso (i file della Regione ne occupano una ventina di MB). */
const MAX_UNZIPPED_BYTES = 200 * 1024 * 1024;

const bad = (why: string) => new AppError(422, `Il file non è un Excel (.xlsx) leggibile: ${why}`, 'BAD_XLSX');

/** I file contenuti in un archivio ZIP (solo quelli il cui nome supera il filtro). */
function unzip(bytes: Uint8Array, wanted: (name: string) => boolean): Map<string, Buffer> {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // L'indice dell'archivio sta in fondo, dopo un eventuale commento (al massimo 64 KB).
  let end = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw bad('non è un archivio ZIP');
  const count = buf.readUInt16LE(end + 10);
  let pos = buf.readUInt32LE(end + 16);
  const files = new Map<string, Buffer>();
  let total = 0;
  for (let n = 0; n < count; n++) {
    if (pos + 46 > buf.length || buf.readUInt32LE(pos) !== 0x02014b50) throw bad('indice danneggiato');
    const method = buf.readUInt16LE(pos + 10);
    const compressedSize = buf.readUInt32LE(pos + 20);
    const nameLength = buf.readUInt16LE(pos + 28);
    const local = buf.readUInt32LE(pos + 42);
    const name = buf.toString('utf8', pos + 46, pos + 46 + nameLength);
    pos += 46 + nameLength + buf.readUInt16LE(pos + 30) + buf.readUInt16LE(pos + 32);
    if (!wanted(name)) continue;
    if (local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50) throw bad('contenuto danneggiato');
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + compressedSize);
    let content: Buffer;
    try {
      if (method === 0) content = data;
      else if (method === 8) content = inflateRawSync(data, { maxOutputLength: MAX_UNZIPPED_BYTES - total });
      else throw new Error('compressione non supportata');
    } catch {
      throw bad('contenuto danneggiato o troppo grande');
    }
    total += content.length;
    if (total > MAX_UNZIPPED_BYTES) throw bad('troppo grande');
    files.set(name, content);
  }
  return files;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeXml(text: string): string {
  return text
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (all, code: string) => {
      if (code[0] !== '#') return ENTITIES[code] ?? all;
      const point = code[1] === 'x' || code[1] === 'X' ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10);
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : '';
    })
    // Excel scrive così i caratteri di controllo ("_x000D_" = ritorno a capo).
    .replace(/_x([0-9A-Fa-f]{4})_/g, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)));
}

/** Testo di un elemento che contiene uno o più `<t>` (ignorando le annotazioni fonetiche). */
function textOf(xml: string): string {
  let out = '';
  for (const m of xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) out += m[1];
  return decodeXml(out);
}

function columnIndex(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/**
 * Tutti i fogli di un file .xlsx, ciascuno come righe di celle di testo (le celle vuote sono stringhe vuote).
 * I numeri restano come li scrive Excel ("52.4"); le date sono numeri di giorni: vedi `excelDate`.
 */
export function readXlsxSheets(bytes: Uint8Array): string[][][] {
  const files = unzip(bytes, (name) => name === 'xl/sharedStrings.xml' || /^xl\/worksheets\/sheet\d+\.xml$/.test(name));
  const shared: string[] = [];
  const sharedXml = files.get('xl/sharedStrings.xml')?.toString('utf8') ?? '';
  for (const m of sharedXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g)) shared.push(textOf(m[1] ?? ''));

  const names = [...files.keys()].filter((n) => n.startsWith('xl/worksheets/')).sort((a, b) => Number(/\d+/.exec(a)![0]) - Number(/\d+/.exec(b)![0]));
  if (!names.length) throw bad('non contiene fogli');
  return names.map((name) => {
    const rows: string[][] = [];
    for (const rowMatch of files.get(name)!.toString('utf8').matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const row: string[] = [];
      for (const cell of rowMatch[1]!.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = /\br="([A-Z]+)\d+"/.exec(cell[1]!);
        const body = cell[2] ?? '';
        if (!ref || !body) continue;
        const type = /\bt="(\w+)"/.exec(cell[1]!)?.[1];
        const value = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body)?.[1];
        let text: string;
        if (type === 'inlineStr') text = textOf(body);
        else if (value === undefined) continue;
        else if (type === 's') text = shared[Number(value)] ?? '';
        else text = decodeXml(value);
        const index = columnIndex(ref[1]!);
        while (row.length < index) row.push('');
        row[index] = text;
      }
      rows.push(row);
    }
    return rows;
  });
}

/** Data di una cella: numero di giorni di Excel (45656 = 30/12/2024) oppure testo "gg/mm/aaaa". */
export function excelDate(cell: string | undefined): Date | null {
  const text = cell?.trim();
  if (!text) return null;
  const italian = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (italian) return new Date(Date.UTC(Number(italian[3]), Number(italian[2]) - 1, Number(italian[1])));
  const days = Number(text);
  if (!Number.isFinite(days) || days < 1 || days > 200_000) return null;
  return new Date(Date.UTC(1899, 11, 30) + Math.floor(days) * 86_400_000);
}
