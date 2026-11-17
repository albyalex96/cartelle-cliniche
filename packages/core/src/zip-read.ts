import { createReadStream } from 'node:fs';
import { open, type FileHandle } from 'node:fs/promises';
import { Readable, Transform } from 'node:stream';
import { crc32, createInflateRaw } from 'node:zlib';

/**
 * Lettura di un archivio ZIP salvato su disco, un file alla volta: l'archivio non viene mai caricato tutto in
 * memoria (un backup con le immagini può occupare molti GB). Supporta le estensioni ZIP64, come `zip.ts`.
 */

export interface ZipFileEntry {
  name: string;
  method: number;
  crc: number;
  compressedSize: number;
  size: number;
  localOffset: number;
}

export class ZipFormatError extends Error {}

const bad = (why: string) => new ZipFormatError(why);

async function readAt(fh: FileHandle, position: number, length: number): Promise<Buffer> {
  const buf = Buffer.alloc(length);
  const { bytesRead } = await fh.read(buf, 0, length, position);
  if (bytesRead !== length) throw bad('archivio troncato');
  return buf;
}

export class ZipReader {
  private constructor(
    readonly path: string,
    private readonly fh: FileHandle,
    readonly entries: Map<string, ZipFileEntry>,
  ) {}

  static async open(file: string): Promise<ZipReader> {
    const fh = await open(file, 'r');
    try {
      return new ZipReader(file, fh, await readIndex(fh));
    } catch (err) {
      await fh.close();
      throw err;
    }
  }

  async close() {
    await this.fh.close();
  }

  /** Posizione dei dati (dopo l'intestazione locale). */
  private async dataStart(entry: ZipFileEntry): Promise<number> {
    const local = await readAt(this.fh, entry.localOffset, 30);
    if (local.readUInt32LE(0) !== 0x04034b50) throw bad(`intestazione danneggiata: ${entry.name}`);
    return entry.localOffset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28);
  }

  /** Contenuto come flusso, con il controllo CRC alla fine. */
  async stream(entry: ZipFileEntry): Promise<Readable> {
    if (entry.method !== 0 && entry.method !== 8) throw bad(`compressione non supportata: ${entry.name}`);
    const start = await this.dataStart(entry);
    const raw: Readable =
      entry.compressedSize === 0
        ? Readable.from([])
        : createReadStream(this.path, { start, end: start + entry.compressedSize - 1 });
    let crc = 0;
    let size = 0;
    const check = new Transform({
      transform(chunk: Buffer, _enc, done) {
        crc = crc32(chunk, crc);
        size += chunk.length;
        if (size > entry.size) return done(bad(`contenuto più lungo del previsto: ${entry.name}`));
        done(null, chunk);
      },
      flush(done) {
        if (size !== entry.size || crc >>> 0 !== entry.crc >>> 0) return done(bad(`contenuto danneggiato: ${entry.name}`));
        done();
      },
    });
    const forward = (err: Error) => check.destroy(err);
    raw.on('error', forward);
    if (entry.method === 0) return raw.pipe(check);
    const inflate = createInflateRaw();
    inflate.on('error', () => forward(bad(`contenuto danneggiato: ${entry.name}`)));
    return raw.pipe(inflate).pipe(check);
  }

  /** Contenuto intero in memoria (solo per file piccoli). */
  async read(entry: ZipFileEntry): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of await this.stream(entry)) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks);
  }
}

async function readIndex(fh: FileHandle): Promise<Map<string, ZipFileEntry>> {
  const { size: fileSize } = await fh.stat();
  if (fileSize < 22) throw bad('non è un archivio ZIP');
  // Il record finale sta in fondo, dopo un eventuale commento (al massimo 64 KB).
  const tailLength = Math.min(fileSize, 22 + 0xffff + 20);
  const tail = await readAt(fh, fileSize - tailLength, tailLength);
  let end = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw bad('non è un archivio ZIP');
  let count = tail.readUInt16LE(end + 10);
  let dirSize = tail.readUInt32LE(end + 12);
  let dirOffset = tail.readUInt32LE(end + 16);

  // ZIP64: il localizzatore sta subito prima del record finale.
  if (end >= 20 && tail.readUInt32LE(end - 20) === 0x07064b50) {
    const recordOffset = Number(tail.readBigUInt64LE(end - 20 + 8));
    const record = await readAt(fh, recordOffset, 56);
    if (record.readUInt32LE(0) !== 0x06064b50) throw bad('indice ZIP64 danneggiato');
    count = Number(record.readBigUInt64LE(32));
    dirSize = Number(record.readBigUInt64LE(40));
    dirOffset = Number(record.readBigUInt64LE(48));
  }
  if (dirOffset + dirSize > fileSize) throw bad('indice danneggiato');

  const dir = await readAt(fh, dirOffset, dirSize);
  const entries = new Map<string, ZipFileEntry>();
  let pos = 0;
  for (let n = 0; n < count; n++) {
    if (pos + 46 > dir.length || dir.readUInt32LE(pos) !== 0x02014b50) throw bad('indice danneggiato');
    const nameLength = dir.readUInt16LE(pos + 28);
    const extraLength = dir.readUInt16LE(pos + 30);
    const name = dir.toString('utf8', pos + 46, pos + 46 + nameLength);
    let compressedSize = dir.readUInt32LE(pos + 20);
    let size = dir.readUInt32LE(pos + 24);
    let localOffset = dir.readUInt32LE(pos + 42);
    // Campo extra ZIP64: contiene, nell'ordine, solo i valori che nell'indice valgono 0xFFFFFFFF.
    let extra = pos + 46 + nameLength;
    const extraEnd = extra + extraLength;
    while (extra + 4 <= extraEnd) {
      const id = dir.readUInt16LE(extra);
      const length = dir.readUInt16LE(extra + 2);
      if (id === 0x0001) {
        let p = extra + 4;
        if (size === 0xffffffff) (size = Number(dir.readBigUInt64LE(p))), (p += 8);
        if (compressedSize === 0xffffffff) (compressedSize = Number(dir.readBigUInt64LE(p))), (p += 8);
        if (localOffset === 0xffffffff) localOffset = Number(dir.readBigUInt64LE(p));
      }
      extra += 4 + length;
    }
    entries.set(name, {
      name,
      method: dir.readUInt16LE(pos + 10),
      crc: dir.readUInt32LE(pos + 16),
      compressedSize,
      size,
      localOffset,
    });
    pos = extraEnd + dir.readUInt16LE(pos + 32);
  }
  return entries;
}
