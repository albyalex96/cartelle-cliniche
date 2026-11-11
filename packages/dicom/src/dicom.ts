import * as dicomParserModule from 'dicom-parser';
import type { DataSet } from 'dicom-parser';

// La libreria è un pacchetto UMD: in Node le funzioni stanno sotto `default`, nei bundler direttamente.
const dicomParser = ((dicomParserModule as { default?: typeof dicomParserModule }).default ?? dicomParserModule) as typeof dicomParserModule;
const parseDicom = (bytes: Uint8Array, options?: Parameters<typeof dicomParserModule.parseDicom>[1]) => dicomParser.parseDicom(bytes, options);

/**
 * Lettura dei dati descrittivi dei file DICOM (le immagini di TAC, risonanze, ecografie…),
 * senza decodificare le immagini. Funziona sia nel browser sia sul server.
 */

/** Riassunto di un file DICOM: a quale studio e serie appartiene e a chi. */
export interface DicomInstance {
  studyUid: string;
  seriesUid: string;
  sopUid?: string;
  sopClassUid?: string;
  patientName?: string;
  patientId?: string;
  /** AAAA-MM-GG */
  patientBirthDate?: string;
  /** AAAA-MM-GG */
  studyDate?: string;
  studyDescription?: string;
  accessionNumber?: string;
  institution?: string;
  modality?: string;
  seriesDescription?: string;
  seriesNumber?: number;
  /** Posizione dell'immagine nella serie. */
  instanceNumber?: number;
}

/** SOP Class dei referti PDF incapsulati in un file DICOM (spesso presenti nei CD). */
export const ENCAPSULATED_PDF_SOP_CLASS = '1.2.840.10008.5.1.4.1.1.104.1';

/** Un file DICOM "Part 10" ha 128 byte di preambolo seguiti da "DICM". */
export function isDicomFile(head: Uint8Array): boolean {
  return head.length >= 132 && head[128] === 0x44 && head[129] === 0x49 && head[130] === 0x43 && head[131] === 0x4d;
}

/** "20240314" → "2024-03-14" (solo se è una data valida). */
export function dicomDate(value: string | undefined): string | undefined {
  const m = value && /^(\d{4})(\d{2})(\d{2})/.exec(value.trim());
  if (!m) return undefined;
  const [, y, mo, d] = m;
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  if (date.getUTCMonth() !== Number(mo) - 1 || date.getUTCDate() !== Number(d)) return undefined;
  return `${y}-${mo}-${d}`;
}

/** "ROSSI^MARIO^^DOTT" → "ROSSI MARIO" (cognome, nome; il resto si ignora). */
export function dicomPersonName(value: string | undefined): string | undefined {
  if (!value) return undefined;
  // Un nome può avere più rappresentazioni separate da "=" (alfabetica, ideografica…): si usa la prima.
  const [family = '', given = ''] = value.split('=')[0]!.split('^');
  const name = `${family} ${given}`.replace(/\s+/g, ' ').trim();
  return name || undefined;
}

/**
 * Testo di un elemento, decodificato con il set di caratteri dichiarato nel file
 * (ISO_IR 100 = Latin-1, il più comune in Italia; ISO_IR 192 = UTF-8).
 */
function text(ds: DataSet, tag: string, charset: string): string | undefined {
  const el = ds.elements[tag];
  if (!el || el.length === 0) return undefined;
  const bytes = ds.byteArray.subarray(el.dataOffset, el.dataOffset + el.length);
  const decoded = new TextDecoder(/ISO_IR 192/i.test(charset) ? 'utf-8' : 'latin1').decode(bytes);
  const value = decoded.replace(/\0/g, '').trim();
  return value || undefined;
}

function charsetOf(ds: DataSet) {
  return ds.string('x00080005') ?? '';
}

function instanceFrom(ds: DataSet): DicomInstance | null {
  const cs = charsetOf(ds);
  const studyUid = ds.string('x0020000d');
  const seriesUid = ds.string('x0020000e');
  if (!studyUid || !seriesUid) return null;
  const inst: DicomInstance = { studyUid, seriesUid };
  const set = <K extends keyof DicomInstance>(key: K, value: DicomInstance[K] | undefined) => {
    if (value !== undefined && value !== '') inst[key] = value;
  };
  set('sopUid', ds.string('x00080018'));
  set('sopClassUid', ds.string('x00080016'));
  set('patientName', dicomPersonName(text(ds, 'x00100010', cs)));
  set('patientId', text(ds, 'x00100020', cs));
  set('patientBirthDate', dicomDate(ds.string('x00100030')));
  set('studyDate', dicomDate(ds.string('x00080020')));
  set('studyDescription', text(ds, 'x00081030', cs));
  set('accessionNumber', text(ds, 'x00080050', cs));
  set('institution', text(ds, 'x00080080', cs));
  set('modality', ds.string('x00080060'));
  set('seriesDescription', text(ds, 'x0008103e', cs));
  set('seriesNumber', ds.intString('x00200011'));
  set('instanceNumber', ds.intString('x00200013'));
  return inst;
}

/**
 * Legge l'intestazione di un file DICOM (fino ai dati dell'immagine, che si saltano).
 * `bytes` può essere solo l'inizio del file: se non basta, `null` (e si riprova con più byte).
 */
export function readDicomInstance(bytes: Uint8Array): DicomInstance | null {
  if (!isDicomFile(bytes)) return null;
  try {
    return instanceFrom(parseDicom(bytes, { untilTag: 'x7fe00010' }));
  } catch {
    return null;
  }
}

/** Il PDF contenuto in un file DICOM "Encapsulated PDF" (serve il file intero). */
export function readEncapsulatedPdf(bytes: Uint8Array): Uint8Array | null {
  try {
    const ds = parseDicom(bytes);
    if (ds.string('x00080016') !== ENCAPSULATED_PDF_SOP_CLASS) return null;
    const el = ds.elements['x00420011'];
    if (!el) return null;
    let pdf = bytes.subarray(el.dataOffset, el.dataOffset + el.length);
    // Il valore può avere un byte di riempimento finale: il PDF termina con "%%EOF".
    while (pdf.length && pdf[pdf.length - 1] === 0) pdf = pdf.subarray(0, pdf.length - 1);
    return pdf.subarray(0, 5).every((b, i) => b === '%PDF-'.charCodeAt(i)) ? pdf : null;
  } catch {
    return null;
  }
}

/**
 * DICOMDIR: l'indice del CD. Elenca pazienti, studi, serie e il percorso di ogni immagine,
 * così non serve aprire tutti i file (lettura molto più veloce da un disco ottico).
 */
export function readDicomdir(bytes: Uint8Array): { instance: DicomInstance; path: string }[] | null {
  let ds: DataSet;
  try {
    ds = parseDicom(bytes);
  } catch {
    return null;
  }
  const records = ds.elements['x00041220']?.items;
  if (!records?.length) return null;
  const cs = charsetOf(ds);

  const out: { instance: DicomInstance; path: string }[] = [];
  let patient: Partial<DicomInstance> = {};
  let study: Partial<DicomInstance> = {};
  let series: Partial<DicomInstance> = {};
  // I record sono in ordine gerarchico: PATIENT → STUDY → SERIES → IMAGE…
  for (const item of records) {
    const r = item.dataSet;
    if (!r) continue;
    const type = r.string('x00041430')?.toUpperCase();
    const rcs = charsetOf(r) || cs;
    if (type === 'PATIENT') {
      patient = {
        patientName: dicomPersonName(text(r, 'x00100010', rcs)),
        patientId: text(r, 'x00100020', rcs),
        patientBirthDate: dicomDate(r.string('x00100030')),
      };
    } else if (type === 'STUDY') {
      study = {
        studyUid: r.string('x0020000d'),
        studyDate: dicomDate(r.string('x00080020')),
        studyDescription: text(r, 'x00081030', rcs),
        accessionNumber: text(r, 'x00080050', rcs),
      };
    } else if (type === 'SERIES') {
      series = {
        seriesUid: r.string('x0020000e'),
        modality: r.string('x00080060'),
        seriesDescription: text(r, 'x0008103e', rcs),
        seriesNumber: r.intString('x00200011'),
        institution: text(r, 'x00080080', rcs),
      };
    } else {
      // IMAGE, ENCAP DOC, SR DOCUMENT…: un file vero e proprio.
      const fileId = r.string('x00041500');
      if (!fileId || !study.studyUid || !series.seriesUid) continue;
      const instance = Object.fromEntries(
        Object.entries({ ...patient, ...study, ...series, sopUid: r.string('x00041511'), sopClassUid: r.string('x00041510') }).filter(
          ([, v]) => v !== undefined && v !== '',
        ),
      ) as unknown as DicomInstance;
      if (type === 'ENCAP DOC' && !instance.modality) instance.modality = 'DOC';
      // Percorso con "\" come separatore, relativo alla cartella del DICOMDIR.
      out.push({ instance, path: fileId.split('\\').map((p) => p.trim()).join('/') });
    }
  }
  return out;
}
