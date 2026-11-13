import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  dicomDate,
  dicomPersonName,
  ENCAPSULATED_PDF_SOP_CLASS,
  isDicomFile,
  readDicomGeometry,
  readDicomInstance,
  readEncapsulatedPdf,
  renderDicomPreview,
  scanDisc,
} from '../src';
import { makeDicom, makeImage, memoryFile } from '../src/testing';

// Tutti i dati qui sotto sono INVENTATI.
const RM = { patient: 'TIZIONI^ARTURO', patientId: 'TZZRTR58S03Z999K', birthDate: '19581103', study: '1.2.3.100', studyDate: '20240314', studyDescription: 'RM GINOCCHIO DX', institution: 'Ospedale di Prova' };

test('date, nomi e riconoscimento dei file DICOM', () => {
  assert.equal(dicomDate('20240314'), '2024-03-14');
  assert.equal(dicomDate('20240231'), undefined);
  assert.equal(dicomPersonName('ROSSI^MARIO^^DOTT'), 'ROSSI MARIO');
  assert.equal(dicomPersonName('ROSSI^MARIO=ロッシ'), 'ROSSI MARIO');
  assert.equal(isDicomFile(makeImage({ ...RM, series: '1.2.3.100.1' })), true);
  assert.equal(isDicomFile(new TextEncoder().encode('%PDF-1.4 ...'.padEnd(200))), false);
});

test('intestazione: paziente, studio, serie, con accenti in Latin-1 e UTF-8', () => {
  const latin = readDicomInstance(makeImage({ ...RM, patient: 'D’ÈSEMPIO^NICCOLÒ'.replace('’', "'"), series: '1.2.3.100.1', seriesNumber: '3', modality: 'MR', seriesDescription: 'T1 SAG' }))!;
  assert.equal(latin.patientName, "D'ÈSEMPIO NICCOLÒ");
  assert.equal(latin.studyDate, '2024-03-14');
  assert.equal(latin.patientBirthDate, '1958-11-03');
  assert.equal(latin.modality, 'MR');
  assert.equal(latin.seriesNumber, 3);
  assert.equal(latin.institution, 'Ospedale di Prova');
  const utf8 = readDicomInstance(makeImage({ ...RM, patient: 'D’ÈSEMPIO^NICCOLÒ', series: '1.2.3.100.1', utf8: true }))!;
  assert.equal(utf8.patientName, 'D’ÈSEMPIO NICCOLÒ');
});

test('disco senza indice: raggruppa studi e serie, ignora programmi e altri file', async () => {
  const files = [
    memoryFile('VIEWER/viewer.exe', new Uint8Array(5000)),
    memoryFile('autorun.inf', new TextEncoder().encode('[autorun]')),
    memoryFile('REFERTO.PDF', new TextEncoder().encode('%PDF-1.4')),
    memoryFile('DATA/IM0001', makeImage({ ...RM, series: '1.2.3.100.2', seriesNumber: '2', modality: 'MR', seriesDescription: 'T2 COR' })),
    memoryFile('DATA/IM0002', makeImage({ ...RM, series: '1.2.3.100.1', seriesNumber: '1', modality: 'MR', seriesDescription: 'T1 SAG' })),
    memoryFile('DATA/IM0003', makeImage({ ...RM, series: '1.2.3.100.1', seriesNumber: '1', modality: 'MR' })),
    memoryFile('DATA/IM0004', makeImage({ ...RM, study: '1.2.3.200', studyDate: '20230105', studyDescription: 'RX TORACE', series: '1.2.3.200.1', modality: 'CR' })),
    memoryFile('DATA/NOTE', new TextEncoder().encode('non sono un dicom'.padEnd(300))),
  ];
  const progress: number[] = [];
  const scan = await scanDisc(files, { onProgress: (done) => progress.push(done) });
  assert.equal(scan.source, 'files');
  assert.deepEqual(scan.pdfs.map((f) => f.path), ['REFERTO.PDF']);
  assert.equal(files[0]!.reads, 0, 'i programmi del CD non vengono nemmeno aperti');
  assert.deepEqual(
    scan.studies.map((s) => [s.date, s.description, s.modalities, s.imageCount, s.series.map((x) => [x.number, x.files.length])]),
    [
      ['2024-03-14', 'RM GINOCCHIO DX', ['MR'], 3, [[1, 2], [2, 1]]],
      ['2023-01-05', 'RX TORACE', ['CR'], 1, [[undefined, 1]]],
    ],
  );
  assert.deepEqual(scan.studies[0]!.patient, { name: 'TIZIONI ARTURO', id: 'TZZRTR58S03Z999K', birthDate: '1958-11-03' });
  assert.equal(progress.at(-1), 5, 'avanzamento fino all’ultimo file');
});

test('disco con indice DICOMDIR: non apre le immagini', async () => {
  const record = (type: string, extra: [string, string, string][]) => [['00041430', 'CS', type], ...extra] as [string, string, string][];
  const dicomdir = makeDicom([
    [
      '00041220',
      'SQ',
      [
        record('PATIENT', [['00100010', 'PN', 'TIZIONI^ARTURO'], ['00100020', 'LO', 'TZZRTR58S03Z999K']]),
        record('STUDY', [['0020000D', 'UI', '1.2.3.100'], ['00080020', 'DA', '20240314'], ['00081030', 'LO', 'RM GINOCCHIO DX']]),
        record('SERIES', [['0020000E', 'UI', '1.2.3.100.1'], ['00080060', 'CS', 'MR'], ['00200011', 'IS', '1']]),
        record('IMAGE', [['00041500', 'CS', 'DICOM\\IM0001']]),
        record('IMAGE', [['00041500', 'CS', 'DICOM\\IM0002']]),
        record('IMAGE', [['00041500', 'CS', 'DICOM\\MANCANTE']]),
      ],
    ],
  ]);
  const images = [memoryFile('CD/DICOM/IM0001', new Uint8Array(1000)), memoryFile('CD/dicom/im0002', new Uint8Array(3000))];
  const scan = await scanDisc([memoryFile('CD/DICOMDIR', dicomdir), ...images]);
  assert.equal(scan.source, 'dicomdir');
  assert.equal(images[0]!.reads + images[1]!.reads, 0, 'le immagini non vengono lette');
  const [study] = scan.studies;
  assert.equal(study?.description, 'RM GINOCCHIO DX');
  assert.equal(study?.imageCount, 2, 'il file mancante viene ignorato; maiuscole/minuscole indifferenti');
  assert.equal(study?.bytes, 4000);
  assert.equal(study?.patient.name, 'TIZIONI ARTURO');
});

test('referto PDF incapsulato in un file DICOM', async () => {
  const pdf = new TextEncoder().encode('%PDF-1.4\n...\n%%EOF');
  const doc = makeDicom(
    [
      ['0020000D', 'UI', '1.2.3.100'],
      ['0020000E', 'UI', '1.2.3.100.9'],
      ['00080016', 'UI', ENCAPSULATED_PDF_SOP_CLASS],
      ['00080060', 'CS', 'DOC'],
      ['00420011', 'OB', pdf],
    ],
    { sopClass: ENCAPSULATED_PDF_SOP_CLASS },
  );
  const scan = await scanDisc([memoryFile('DATA/DOC1', doc), memoryFile('DATA/IM1', makeImage({ ...RM, series: '1.2.3.100.1' }))]);
  assert.equal(scan.encapsulatedPdfs.length, 1);
  assert.equal(scan.studies[0]!.imageCount, 1, 'il referto non conta come immagine');
  assert.deepEqual(readEncapsulatedPdf(doc), pdf);
});

test('lettura annullata', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => scanDisc([memoryFile('IM1', makeImage({ ...RM, series: '1.2.3.100.1' }))], { signal: controller.signal }), { name: 'AbortError' });
});

test('anteprima: grigi a 16 bit con finestra, riduzione, negativo e formati non letti', () => {
  const u16 = (n: number) => new Uint8Array([n & 0xff, n >> 8]);
  // 4×2 pixel a 12 bit: valori da 0 a 4000.
  const values = [0, 1000, 2000, 4000, 0, 1000, 2000, 4000];
  const pixelData = new Uint8Array(values.flatMap((v) => [...u16(v)]));
  const image = (extra: Parameters<typeof makeImage>[0]['extra'] = []) =>
    makeImage({
      ...RM,
      series: '1.2.3.100.1',
      extra: [
        ['00280002', 'US', u16(1)],
        ['00280004', 'CS', 'MONOCHROME2'],
        ['00280010', 'US', u16(2)],
        ['00280011', 'US', u16(4)],
        ['00280100', 'US', u16(16)],
        ['00280101', 'US', u16(12)],
        ['00280103', 'US', u16(0)],
        ['7FE00010', 'OW', pixelData],
        ...extra,
      ],
    });

  // Senza finestra: dal valore più basso (nero) al più alto (bianco).
  const full = renderDicomPreview(image(), { maxSize: 100 });
  assert.ok(full?.kind === 'pixels');
  assert.deepEqual([full.width, full.height, full.channels, full.frames], [4, 2, 1, 1]);
  assert.deepEqual([...full.pixels], [0, 64, 128, 255, 0, 64, 128, 255]);

  // Con la finestra del file: sotto è nero, sopra è bianco.
  const windowed = renderDicomPreview(image([['00281050', 'DS', '1500'], ['00281051', 'DS', '1000']]), { maxSize: 100 });
  assert.ok(windowed?.kind === 'pixels');
  assert.deepEqual([...windowed.pixels.subarray(0, 4)], [0, 0, 255, 255]);

  // MONOCHROME1: i valori alti sono scuri.
  const negative = renderDicomPreview(image([['00280004', 'CS', 'MONOCHROME1']]), { maxSize: 100 });
  assert.ok(negative?.kind === 'pixels');
  assert.deepEqual([...negative.pixels.subarray(0, 4)], [255, 191, 127, 0]);

  // Miniatura: ogni pixel è la media di un blocco 2×2.
  const small = renderDicomPreview(image(), { maxSize: 2 });
  assert.ok(small?.kind === 'pixels');
  assert.deepEqual([small.width, small.height, [...small.pixels]], [2, 1, [0, 255]]);

  // File senza dimensioni dell'immagine o con pixel mancanti: nessuna anteprima (e nessun errore).
  assert.equal(renderDicomPreview(makeImage({ ...RM, series: '1.2.3.100.1' }), { maxSize: 100 }), null);
  assert.equal(renderDicomPreview(image([['7FE00010', 'OW', new Uint8Array(4)]]), { maxSize: 100 }), null);
  assert.equal(renderDicomPreview(new Uint8Array(300), { maxSize: 100 }), null);

  // Scala per le misure: quella reale se c'è, altrimenti quella del rivelatore, altrimenti nessuna.
  assert.deepEqual(readDicomGeometry(image()), { rows: 2, columns: 4, spacing: null, spacingSource: null });
  assert.deepEqual(readDicomGeometry(image([['00280030', 'DS', '0.5\\0.25'], ['00181164', 'DS', '0.2\\0.2']])), {
    rows: 2,
    columns: 4,
    spacing: { row: 0.5, column: 0.25 },
    spacingSource: 'patient',
  });
  assert.deepEqual(readDicomGeometry(image([['00181164', 'DS', '0.143\\0.143']]))?.spacingSource, 'detector');
  assert.equal(readDicomGeometry(image([['00280030', 'DS', '0\\abc']]))?.spacing, null);
  assert.equal(readDicomGeometry(makeImage({ ...RM, series: '1.2.3.100.1' })), null);
});
