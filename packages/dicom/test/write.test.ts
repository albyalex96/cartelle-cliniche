import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isDicomFile, readDicomInstance, renderDicomPreview } from '../src';
import { newDicomUid, SECONDARY_CAPTURE_SOP_CLASS, writeSecondaryCapture } from '../src/write';

// JPEG minimo (1x1 pixel, grigio): basta per verificare struttura e lettura del file.
const TINY_JPEG = Uint8Array.from(
  Buffer.from(
    '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
    'base64',
  ),
);

test('UID nuovi: formato 2.25, lunghezza valida, mai uguali', () => {
  const a = newDicomUid();
  assert.match(a, /^2\.25\.\d+$/);
  assert.ok(a.length <= 64);
  assert.notEqual(a, newDicomUid());
});

test('Secondary Capture con JPEG: si rilegge come le immagini dei CD, senza dati anagrafici', () => {
  const { bytes, studyUid, sopUid } = writeSecondaryCapture({ jpeg: TINY_JPEG, width: 1, height: 1, studyDate: '2025-05-02', description: 'Ritaglio di prova' });
  assert.ok(isDicomFile(bytes));
  const inst = readDicomInstance(bytes)!;
  assert.equal(inst.studyUid, studyUid);
  assert.equal(inst.sopUid, sopUid);
  assert.equal(inst.sopClassUid, SECONDARY_CAPTURE_SOP_CLASS);
  assert.equal(inst.modality, 'OT');
  assert.equal(inst.studyDate, '2025-05-02');
  assert.equal(inst.studyDescription, 'Ritaglio di prova');
  assert.equal(inst.patientName, undefined);

  const preview = renderDicomPreview(bytes, { maxSize: 256 });
  assert.equal(preview?.kind, 'jpeg');
  if (preview?.kind === 'jpeg') assert.deepEqual(preview.data.subarray(0, TINY_JPEG.length), TINY_JPEG);
});

test('rifiuta ciò che non è un JPEG', () => {
  assert.throws(() => writeSecondaryCapture({ jpeg: new Uint8Array([1, 2, 3]), width: 1, height: 1, description: 'x' }));
});
