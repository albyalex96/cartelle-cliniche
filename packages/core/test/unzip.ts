import assert from 'node:assert/strict';
import { crc32, inflateRawSync } from 'node:zlib';

/** Utilità per i test: lettura degli archivi ZIP prodotti dall'esportazione. */

/** Legge l'archivio come farebbe un programma qualsiasi: dall'indice in fondo. */
export function readZip(buf: Buffer): Map<string, { data: Buffer; method: number }> {
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

export async function collect(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}
