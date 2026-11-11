/**
 * Generatore di file DICOM minimi (solo per i test: dati inventati).
 * Sintassi "Explicit VR Little Endian", la più comune nei CD.
 */
import type { DiscFile } from './disc';

type Value = string | Uint8Array | Item[];
/** [tag "GGGGEEEE", VR, valore]. Per le sequenze (SQ) il valore è un elenco di item. */
export type Element = [tag: string, vr: string, value: Value];
type Item = Element[];

const LONG_VR = new Set(['OB', 'OW', 'OF', 'SQ', 'UT', 'UN']);

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

const u16 = (n: number) => new Uint8Array([n & 0xff, (n >> 8) & 0xff]);
const u32 = (n: number) => new Uint8Array([n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff]);
const tagBytes = (tag: string) => concat([u16(parseInt(tag.slice(0, 4), 16)), u16(parseInt(tag.slice(4), 16))]);

function valueBytes(vr: string, value: Value, charset: string): Uint8Array {
  if (Array.isArray(value)) {
    // Sequenza: ogni item è FFFE,E000 + lunghezza + elementi.
    return concat(value.map((item) => {
      const body = encode(item, charset);
      return concat([tagBytes('FFFEE000'), u32(body.length), body]);
    }));
  }
  let bytes = typeof value === 'string' ? (charset === 'utf-8' ? new TextEncoder().encode(value) : Uint8Array.from(value, (c) => c.charCodeAt(0))) : value;
  // Lunghezza pari: spazio per i testi, zero per UID e dati binari.
  if (bytes.length % 2) bytes = concat([bytes, new Uint8Array([vr === 'UI' || typeof value !== 'string' ? 0 : 0x20])]);
  return bytes;
}

function encode(elements: Element[], charset: string): Uint8Array {
  const sorted = [...elements].sort((a, b) => a[0].localeCompare(b[0]));
  return concat(
    sorted.map(([tag, vr, value]) => {
      const v = valueBytes(vr, value, charset);
      const header = LONG_VR.has(vr)
        ? concat([tagBytes(tag), new TextEncoder().encode(vr), u16(0), u32(v.length)])
        : concat([tagBytes(tag), new TextEncoder().encode(vr), u16(v.length)]);
      return concat([header, v]);
    }),
  );
}

/** File DICOM completo (preambolo, "DICM", intestazione meta, dati). */
export function makeDicom(elements: Element[], opts: { sopClass?: string; utf8?: boolean } = {}): Uint8Array {
  const charset = opts.utf8 ? 'utf-8' : 'latin1';
  const meta = encode(
    [
      ['00020001', 'OB', new Uint8Array([0, 1])],
      ['00020002', 'UI', opts.sopClass ?? '1.2.840.10008.5.1.4.1.1.4'],
      ['00020003', 'UI', '1.2.3.4.5.6.7'],
      ['00020010', 'UI', '1.2.840.10008.1.2.1'],
    ],
    charset,
  );
  const groupLength = encode([['00020000', 'UL', u32(meta.length)]], charset);
  const data = encode(opts.utf8 ? [['00080005', 'CS', 'ISO_IR 192'], ...elements] : elements, charset);
  return concat([new Uint8Array(128), new TextEncoder().encode('DICM'), groupLength, meta, data]);
}

/** Immagine di una serie, con i campi che servono per raggrupparla. */
export function makeImage(o: {
  patient?: string;
  patientId?: string;
  birthDate?: string;
  study: string;
  studyDate?: string;
  studyDescription?: string;
  series: string;
  seriesNumber?: string;
  modality?: string;
  seriesDescription?: string;
  institution?: string;
  utf8?: boolean;
}): Uint8Array {
  const el: Element[] = [
    ['0020000D', 'UI', o.study],
    ['0020000E', 'UI', o.series],
    ['00080018', 'UI', `${o.series}.${Math.floor(Math.random() * 1e6)}`],
    ['00080016', 'UI', '1.2.840.10008.5.1.4.1.1.4'],
    ['7FE00010', 'OW', new Uint8Array(64)],
  ];
  const add = (tag: string, vr: string, v?: string) => v && el.push([tag, vr, v]);
  add('00100010', 'PN', o.patient);
  add('00100020', 'LO', o.patientId);
  add('00100030', 'DA', o.birthDate);
  add('00080020', 'DA', o.studyDate);
  add('00081030', 'LO', o.studyDescription);
  add('00080060', 'CS', o.modality);
  add('0008103E', 'LO', o.seriesDescription);
  add('00200011', 'IS', o.seriesNumber);
  add('00080080', 'LO', o.institution);
  return makeDicom(el, { utf8: o.utf8 });
}

/** File in memoria con l'interfaccia di `scanDisc`. */
export function memoryFile(path: string, bytes: Uint8Array): DiscFile & { reads: number } {
  const file = {
    path,
    size: bytes.length,
    reads: 0,
    async read(start: number, end: number) {
      file.reads++;
      return bytes.slice(start, end);
    },
  };
  return file;
}
