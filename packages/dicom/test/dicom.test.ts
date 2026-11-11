import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  dicomDate,
  dicomPersonName,
  ENCAPSULATED_PDF_SOP_CLASS,
  isDicomFile,
  readDicomInstance,
  readEncapsulatedPdf,
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
