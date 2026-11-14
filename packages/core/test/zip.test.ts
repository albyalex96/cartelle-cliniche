import assert from 'node:assert/strict';
import { test } from 'node:test';
import { zipStream, type ZipEntry } from '../src/zip';
import { collect, readZip } from './unzip';

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
