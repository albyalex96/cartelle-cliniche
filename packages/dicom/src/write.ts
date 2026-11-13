import { randomUUID } from 'node:crypto';

/**
 * Scrittura di un file DICOM "Secondary Capture" con un'immagine JPEG: serve a salvare nell'archivio
 * delle immagini una foto caricata o un ritaglio di un referto PDF, come se arrivasse da un CD.
 * Così si apre con lo stesso visualizzatore e si collega ai referti come le altre immagini.
 * Il file NON contiene dati anagrafici: lo studio appartiene al paziente nel database.
 */

export const SECONDARY_CAPTURE_SOP_CLASS = '1.2.840.10008.5.1.4.1.1.7';
const JPEG_BASELINE = '1.2.840.10008.1.2.4.50';
const IMPLEMENTATION_UID = '2.25.214013958113392645613404325004286582912';

/** UID DICOM nuovo, ricavato da un UUID casuale (formato "2.25.<numero>", standard). */
export const newDicomUid = () => `2.25.${BigInt(`0x${randomUUID().replace(/-/g, '')}`).toString()}`;

export interface SecondaryCaptureInput {
  /** Immagine JPEG "baseline" (quella prodotta normalmente da browser, telefoni e librerie). */
  jpeg: Uint8Array;
  width: number;
  height: number;
  /** AAAA-MM-GG */
  studyDate?: string;
  description: string;
  studyUid?: string;
  seriesUid?: string;
  sopUid?: string;
}

const LONG_VR = new Set(['OB', 'OW', 'OF', 'SQ', 'UT', 'UN']);
const text = new TextEncoder();

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
const tag = (t: string) => concat([u16(parseInt(t.slice(0, 4), 16)), u16(parseInt(t.slice(4), 16))]);

/** Valori a lunghezza pari: spazio per i testi, zero per UID e dati binari. */
function even(bytes: Uint8Array, pad: number) {
  return bytes.length % 2 ? concat([bytes, new Uint8Array([pad])]) : bytes;
}

function element(t: string, vr: string, value: string | number | Uint8Array): Uint8Array {
  let bytes: Uint8Array;
  if (typeof value === 'number') bytes = vr === 'UL' ? u32(value) : u16(value);
  else if (typeof value === 'string') bytes = even(text.encode(value), vr === 'UI' ? 0 : 0x20);
  else bytes = even(value, 0);
  const vrBytes = text.encode(vr);
  return LONG_VR.has(vr) ? concat([tag(t), vrBytes, u16(0), u32(bytes.length), bytes]) : concat([tag(t), vrBytes, u16(bytes.length), bytes]);
}

/** Dati dell'immagine "incapsulati": tabella degli offset vuota + un frammento con il JPEG. */
function encapsulatedPixelData(jpeg: Uint8Array) {
  const frame = even(jpeg, 0);
  return concat([
    tag('7FE00010'),
    text.encode('OB'),
    u16(0),
    u32(0xffffffff), // lunghezza indefinita
    tag('FFFEE000'),
    u32(0),
    tag('FFFEE000'),
    u32(frame.length),
    frame,
    tag('FFFEE0DD'),
    u32(0),
  ]);
}

const dicomDate = (iso?: string) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.replace(/-/g, '') : '');

export function writeSecondaryCapture(input: SecondaryCaptureInput): { bytes: Uint8Array; studyUid: string; sopUid: string } {
  if (input.jpeg[0] !== 0xff || input.jpeg[1] !== 0xd8) throw new Error('Il contenuto non è un JPEG');
  const studyUid = input.studyUid ?? newDicomUid();
  const seriesUid = input.seriesUid ?? newDicomUid();
  const sopUid = input.sopUid ?? newDicomUid();
  const description = input.description.slice(0, 64);

  const metaBody = concat([
    element('00020001', 'OB', new Uint8Array([0, 1])),
    element('00020002', 'UI', SECONDARY_CAPTURE_SOP_CLASS),
    element('00020003', 'UI', sopUid),
    element('00020010', 'UI', JPEG_BASELINE),
    element('00020012', 'UI', IMPLEMENTATION_UID),
  ]);
  const meta = concat([element('00020000', 'UL', metaBody.length), metaBody]);

  // Elementi in ordine crescente di tag, come richiede lo standard.
  const dataset = concat([
    element('00080005', 'CS', 'ISO_IR 192'), // testi in UTF-8
    element('00080016', 'UI', SECONDARY_CAPTURE_SOP_CLASS),
    element('00080018', 'UI', sopUid),
    element('00080020', 'DA', dicomDate(input.studyDate)),
    element('00080060', 'CS', 'OT'),
    element('00080064', 'CS', 'WSD'), // "workstation": immagine creata al computer
    element('00081030', 'LO', description),
    element('0008103E', 'LO', description),
    element('00100010', 'PN', ''),
    element('00100020', 'LO', ''),
    element('0020000D', 'UI', studyUid),
    element('0020000E', 'UI', seriesUid),
    element('00200011', 'IS', '1'),
    element('00200013', 'IS', '1'),
    element('00280002', 'US', 3),
    element('00280004', 'CS', 'YBR_FULL_422'),
    element('00280006', 'US', 0),
    element('00280010', 'US', input.height),
    element('00280011', 'US', input.width),
    element('00280100', 'US', 8),
    element('00280101', 'US', 8),
    element('00280102', 'US', 7),
    element('00280103', 'US', 0),
    encapsulatedPixelData(input.jpeg),
  ]);

  // Tutto in "Explicit VR Little Endian" (come richiede anche la sintassi JPEG); solo i pixel sono compressi.
  const bytes = concat([new Uint8Array(128), text.encode('DICM'), meta, dataset]);
  return { bytes, studyUid, sopUid };
}
