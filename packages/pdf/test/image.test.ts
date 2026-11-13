import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCanvas } from '@napi-rs/canvas';
import { declaredSize, detectImageKind, imageToJpeg, ImageTooLargeError, renderRegionJpeg, UnsupportedImageError } from '../src/image';
import { makePdf } from '../src/testing';

async function jpegOf(w: number, h: number) {
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#c00';
  ctx.fillRect(0, 0, w, h);
  return new Uint8Array(await c.encode('jpeg', 90));
}

/** Inserisce un blocco EXIF con orientamento e una finta posizione GPS (dati inventati). */
function withExif(jpeg: Uint8Array, orientation: number) {
  const tiff = [0x49, 0x49, 0x2a, 0x00, 8, 0, 0, 0, 1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, orientation, 0, 0, 0, 0, 0, 0, 0];
  const payload = [...Buffer.from('Exif\0\0', 'latin1'), ...tiff, ...Buffer.from('GPS 41.9N 12.5E', 'latin1')];
  const len = payload.length + 2;
  return Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, len >> 8, len & 0xff, ...payload, ...jpeg.subarray(2)]);
}

test('tipo di immagine dal contenuto', async () => {
  assert.equal(detectImageKind(await jpegOf(2, 2)), 'jpeg');
  const png = new Uint8Array(await createCanvas(2, 2).encode('png'));
  assert.equal(detectImageKind(png), 'png');
  assert.equal(detectImageKind(new TextEncoder().encode('<svg></svg>')), null);
  await assert.rejects(imageToJpeg(new TextEncoder().encode('%PDF-1.4')), UnsupportedImageError);
});

test('foto del telefono: rotazione EXIF applicata e metadati rimossi', async () => {
  const photo = withExif(await jpegOf(40, 20), 6);
  const out = await imageToJpeg(photo);
  assert.deepEqual([out.width, out.height], [20, 40], 'girata di 90°');
  assert.equal(Buffer.from(out.jpeg).includes('GPS 41.9N'), false, 'niente EXIF nel risultato');
  assert.equal(Buffer.from(out.jpeg).includes('Exif'), false);
});

test('immagini enormi ridotte, PNG trasparenti su fondo bianco', async () => {
  const big = await imageToJpeg(new Uint8Array(await createCanvas(5000, 100).encode('png')), { maxSide: 1000 });
  assert.deepEqual([big.width, big.height], [1000, 20]);
  assert.equal(detectImageKind(big.jpeg), 'jpeg');
});

test('ritaglio di una zona di una pagina PDF come JPEG', async () => {
  const pdf = makePdf([[{ x: 50, y: 800, text: 'Immagine di prova' }]]);
  const out = await renderRegionJpeg(pdf, 1, { x: 0, y: 0, width: 0.5, height: 0.25 }, 72);
  assert.equal(detectImageKind(out.jpeg), 'jpeg');
  assert.deepEqual([out.width, out.height], [298, 211]);
});

test('dimensioni lette dall’intestazione: le immagini "bomba" vengono rifiutate prima di decodificarle', async () => {
  assert.deepEqual(declaredSize(await jpegOf(40, 20), 'jpeg'), { width: 40, height: 20 });
  const png = new Uint8Array(await createCanvas(30, 10).encode('png'));
  assert.deepEqual(declaredSize(png, 'png'), { width: 30, height: 10 });
  // Stesso PNG con un'intestazione che dichiara 50.000 x 50.000 pixel.
  const bomb = png.slice();
  new DataView(bomb.buffer).setUint32(16, 50_000);
  new DataView(bomb.buffer).setUint32(20, 50_000);
  await assert.rejects(imageToJpeg(bomb), ImageTooLargeError);
});
