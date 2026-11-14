import assert from 'node:assert/strict';
import { test } from 'node:test';
import { crc32, inflateRawSync } from 'node:zlib';
import { zipStream, type ZipEntry } from '../src/zip';

/** Legge l'archivio come farebbe un programma qualsiasi: dall'indice in fondo. */
function readZip(buf: Buffer): Map<string, { data: Buffer; method: number }> {
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(end >= 0, 'record finale presente');
  const count = buf.readUInt16LE(end + 10);
  let pos = buf.readUInt32LE(end + 16);
  const files = new Map<string, { data: Buffer; method: number }>();
  for (let n = 0; n < count; n++) {
    assert.equal(buf.readUInt32LE(pos), 0x02014b50);
    assert.equal(buf.readUInt16LE(pos + 8) & 0x0800, 0x0800, 'nomi in UTF-8');
    const method = buf.readUInt16LE(pos + 10);
    const crc = buf.readUInt32LE(pos + 16);
    const size = buf.readUInt32LE(pos + 20);
    const nameLength = buf.readUInt16LE(pos + 28);
    const local = buf.readUInt32LE(pos + 42);
    const name = buf.toString('utf8', pos + 46, pos + 46 + nameLength);
    pos += 46 + nameLength + buf.readUInt16LE(pos + 30) + buf.readUInt16LE(pos + 32);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const packed = buf.subarray(start, start + size);
    const data = method === 8 ? inflateRawSync(packed) : packed;
    assert.equal(crc32(data), crc, `controllo di ${name}`);
    files.set(name, { data, method });
  }
  return files;
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

test('zip: file compressi e no, nomi accentati, nomi doppi', async () => {
  const text = Buffer.from('Cartella clinica '.repeat(200));
  const random = Buffer.from(Array.from({ length: 300 }, (_, i) => (i * 7919) % 251));
  const entries: ZipEntry[] = [
    { name: 'Riepilogo è.txt', date: new Date(2024, 2, 14, 10, 30), data: async () => text },
    { name: 'Referti/esame.pdf', date: new Date(2024, 2, 14), data: async () => random, compress: false },
    { name: 'Referti/esame.pdf', date: new Date(2024, 2, 15), data: async () => Buffer.from('secondo') },
    { name: 'vuoto.txt', date: new Date(1970, 0, 1), data: async () => new Uint8Array() },
  ];
  const files = readZip(await collect(zipStream(entries)));
  assert.deepEqual([...files.keys()], ['Riepilogo è.txt', 'Referti/esame.pdf', 'Referti/esame (2).pdf', 'vuoto.txt']);
  assert.equal(files.get('Riepilogo è.txt')!.method, 8, 'testo compresso');
  assert.deepEqual(files.get('Riepilogo è.txt')!.data, text);
  assert.equal(files.get('Referti/esame.pdf')!.method, 0, 'PDF salvato così com’è');
  assert.deepEqual(files.get('Referti/esame.pdf')!.data, random);
  assert.equal(files.get('Referti/esame (2).pdf')!.data.toString(), 'secondo');
  assert.equal(files.get('vuoto.txt')!.data.length, 0);
});

test('zip: i file si leggono solo quando servono, anche da un generatore', async () => {
  const read: string[] = [];
  async function* entries(): AsyncGenerator<ZipEntry> {
    for (const name of ['a.txt', 'b.txt']) {
      yield { name, date: new Date(), data: async () => (read.push(name), Buffer.from(name)) };
    }
  }
  const reader = zipStream(entries()).getReader();
  await reader.read();
  assert.deepEqual(read, ['a.txt']);
  await reader.cancel();
  assert.deepEqual(read, ['a.txt'], 'interrotto il download, il resto non si legge');
});
