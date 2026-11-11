import { ENCAPSULATED_PDF_SOP_CLASS, isDicomFile, readDicomdir, readDicomInstance, type DicomInstance } from './dicom';

/**
 * Analisi del contenuto di un CD/DVD di immagini diagnostiche: quali studi contiene,
 * con quante serie e immagini, e quali referti PDF. Nulla viene caricato: si legge e basta.
 */

/** Un file del disco. Nel browser è un `File`; nei test un oggetto in memoria. */
export interface DiscFile {
  /** Percorso relativo alla cartella scelta, con "/" come separatore. */
  path: string;
  size: number;
  /** Legge i byte da `start` a `end` (escluso). */
  read(start: number, end: number): Promise<Uint8Array>;
}

export interface DiscSeries {
  uid: string;
  number?: number;
  modality?: string;
  description?: string;
  files: DiscFile[];
  bytes: number;
}

export interface DiscStudy {
  uid: string;
  /** AAAA-MM-GG */
  date?: string;
  description?: string;
  accessionNumber?: string;
  institution?: string;
  modalities: string[];
  patient: { name?: string; id?: string; birthDate?: string };
  series: DiscSeries[];
  imageCount: number;
  bytes: number;
}

export interface DiscScan {
  studies: DiscStudy[];
  /** PDF sul disco (spesso il referto) */
  pdfs: DiscFile[];
  /** Referti PDF dentro file DICOM: si estraggono con `readEncapsulatedPdf`. */
  encapsulatedPdfs: { file: DiscFile; instance: DicomInstance }[];
  /** Letto dall'indice DICOMDIR (veloce) oppure aprendo i file uno a uno. */
  source: 'dicomdir' | 'files';
}

export interface ScanOptions {
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
  /** File letti in parallelo (un lettore ottico non regge molto di più). */
  concurrency?: number;
}

/** Estensioni che non sono mai immagini DICOM (programmi di visualizzazione, pagine web, ecc.). */
const NOT_DICOM = /\.(exe|dll|ocx|sys|inf|ini|bat|cmd|com|msi|cab|js|css|html?|xml|xsl|json|txt|log|pdf|png|jpe?g|gif|bmp|ico|svg|zip|jar|class|chm|hlp|rtf|docx?|mp4|avi|ttf|otf|lnk|url|autorun)$/i;
const HEADER_BYTES = 256 * 1024;
const MAX_HEADER_BYTES = 4 * 1024 * 1024;
const MAX_DICOMDIR_BYTES = 64 * 1024 * 1024;

const baseName = (p: string) => p.split('/').pop() ?? p;
const dirName = (p: string) => p.split('/').slice(0, -1).join('/');

function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Lettura annullata', 'AbortError');
}

/** Esegue `fn` su tutti gli elementi, al massimo `limit` alla volta. */
async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>, signal?: AbortSignal) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      checkAbort(signal);
      await fn(items[next++]!);
    }
  });
  await Promise.all(workers);
}

/** Legge l'intestazione DICOM di un file (o `null` se non è un file DICOM). */
async function readInstance(file: DiscFile): Promise<DicomInstance | null> {
  if (file.size < 132) return null;
  if (!isDicomFile(await file.read(0, 132))) return null;
  // Di solito l'intestazione è piccola; se il primo pezzo non basta se ne legge uno più grande.
  for (const size of [HEADER_BYTES, MAX_HEADER_BYTES]) {
    const instance = readDicomInstance(await file.read(0, Math.min(file.size, size)));
    if (instance || size >= file.size) return instance;
  }
  return null;
}

function isEncapsulatedPdf(i: DicomInstance) {
  return i.sopClassUid === ENCAPSULATED_PDF_SOP_CLASS;
}

function group(entries: { instance: DicomInstance; file: DiscFile }[]): DiscStudy[] {
  const studies = new Map<string, DiscStudy>();
  for (const { instance: i, file } of entries) {
    let study = studies.get(i.studyUid);
    if (!study) {
      study = {
        uid: i.studyUid,
        date: i.studyDate,
        description: i.studyDescription,
        accessionNumber: i.accessionNumber,
        institution: i.institution,
        modalities: [],
        patient: { name: i.patientName, id: i.patientId, birthDate: i.patientBirthDate },
        series: [],
        imageCount: 0,
        bytes: 0,
      };
      studies.set(i.studyUid, study);
    }
    study.institution ??= i.institution;
    study.description ??= i.studyDescription;
    let series = study.series.find((s) => s.uid === i.seriesUid);
    if (!series) {
      series = { uid: i.seriesUid, number: i.seriesNumber, modality: i.modality, description: i.seriesDescription, files: [], bytes: 0 };
      study.series.push(series);
    }
    series.files.push(file);
    series.bytes += file.size;
    study.imageCount++;
    study.bytes += file.size;
    if (i.modality && !study.modalities.includes(i.modality)) study.modalities.push(i.modality);
  }
  const list = [...studies.values()];
  for (const s of list) {
    s.series.sort((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity));
    // Il campo vuoto non deve comparire (più comodo da confrontare e mostrare).
    for (const key of ['date', 'description', 'accessionNumber', 'institution'] as const) if (s[key] === undefined) delete s[key];
    for (const key of ['name', 'id', 'birthDate'] as const) if (s.patient[key] === undefined) delete s.patient[key];
    for (const series of s.series) for (const key of ['number', 'modality', 'description'] as const) if (series[key] === undefined) delete series[key];
  }
  return list.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
}

export async function scanDisc(files: DiscFile[], opts: ScanOptions = {}): Promise<DiscScan> {
  const { onProgress, signal, concurrency = 4 } = opts;
  const pdfs = files.filter((f) => /\.pdf$/i.test(f.path));
  const byPath = new Map(files.map((f) => [f.path.toUpperCase(), f]));
  const entries: { instance: DicomInstance; file: DiscFile }[] = [];
  let source: DiscScan['source'] = 'files';

  // 1) Indice DICOMDIR, se c'è (quello più vicino alla radice del disco).
  const dicomdir = files
    .filter((f) => baseName(f.path).toUpperCase() === 'DICOMDIR' && f.size <= MAX_DICOMDIR_BYTES)
    .sort((a, b) => a.path.split('/').length - b.path.split('/').length)[0];
  if (dicomdir) {
    checkAbort(signal);
    const records = readDicomdir(await dicomdir.read(0, dicomdir.size));
    const root = dirName(dicomdir.path);
    for (const r of records ?? []) {
      const file = byPath.get((root ? `${root}/${r.path}` : r.path).toUpperCase());
      if (file) entries.push({ instance: r.instance, file });
    }
    if (entries.length) source = 'dicomdir';
  }

  // 2) Senza indice (o indice inutilizzabile): si aprono i file uno a uno.
  if (!entries.length) {
    const candidates = files.filter((f) => f !== dicomdir && !NOT_DICOM.test(f.path));
    let done = 0;
    onProgress?.(0, candidates.length);
    await pool(
      candidates,
      concurrency,
      async (file) => {
        const instance = await readInstance(file);
        if (instance) entries.push({ instance, file });
        onProgress?.(++done, candidates.length);
      },
      signal,
    );
    // Ordine stabile, indipendente da quale lettura finisce prima.
    entries.sort((a, b) => a.file.path.localeCompare(b.file.path));
  } else {
    onProgress?.(entries.length, entries.length);
  }

  const images = entries.filter((e) => !isEncapsulatedPdf(e.instance));
  return {
    studies: group(images),
    pdfs,
    encapsulatedPdfs: entries.filter((e) => isEncapsulatedPdf(e.instance)),
    source,
  };
}
