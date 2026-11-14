import { promisify } from 'node:util';
import { crc32, deflateRaw } from 'node:zlib';

/**
 * Scrittura di un archivio ZIP un file alla volta, come flusso: l'archivio non sta mai tutto in memoria
 * (le immagini di una TAC possono occupare centinaia di MB). Basta zlib, nessuna libreria.
 * Oltre i 4 GB o i 65 535 file l'indice usa le estensioni ZIP64.
 */

export interface ZipEntry {
  /** Percorso nell'archivio, con "/" come separatore. */
  name: string;
  /** Data di modifica mostrata da chi apre l'archivio. */
  date: Date;
  /** Contenuto, letto solo quando tocca a questo file. */
  data: () => Promise<Uint8Array>;
  /** `false` per i file già compressi (PDF, JPEG): si salvano così come sono. */
  compress?: boolean;
}

const deflate = promisify(deflateRaw);
const MAX32 = 0xffffffff;
const MAX16 = 0xffff;

/** Data e ora nel formato MS-DOS dell'intestazione ZIP (ora locale; prima del 1980 non si può). */
function dosDateTime(d: Date): { time: number; date: number } {
  if (Number.isNaN(d.getTime()) || d.getFullYear() < 1980) return { time: 0, date: (1 << 5) | 1 };
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((Math.min(d.getFullYear(), 2107) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/** Lo stesso nome due volte non si apre bene: alla seconda si aggiunge " (2)" prima dell'estensione. */
function uniqueName(name: string, used: Set<string>): string {
  let candidate = name;
  for (let n = 2; used.has(candidate.toLowerCase()); n++) {
    const dot = name.lastIndexOf('.');
    candidate = dot > name.lastIndexOf('/') + 1 ? `${name.slice(0, dot)} (${n})${name.slice(dot)}` : `${name} (${n})`;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

/** Archivio ZIP dei file indicati, prodotto man mano che chi scarica lo legge. */
export function zipStream(entries: Iterable<ZipEntry> | AsyncIterable<ZipEntry>): ReadableStream<Uint8Array> {
  const iterator = (async function* () {
    yield* entries;
  })();
  const central: Buffer[] = [];
  const used = new Set<string>();
  let offset = 0;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const next = await iterator.next();
      if (next.done) {
        controller.enqueue(endOfArchive(central, offset));
        controller.close();
        return;
      }
      const entry = next.value;
      const raw = await entry.data();
      if (raw.byteLength >= MAX32) throw new Error(`File troppo grande per l'archivio: ${entry.name}`);
      const packed = entry.compress === false ? null : await deflate(raw);
      const deflated = packed && packed.byteLength < raw.byteLength;
      const data = deflated ? packed : raw;
      const name = Buffer.from(uniqueName(entry.name, used), 'utf8');
      const { time, date } = dosDateTime(entry.date);
      const crc = crc32(raw);

      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0);
      local.writeUInt16LE(20, 4); // versione necessaria
      local.writeUInt16LE(0x0800, 6); // nomi in UTF-8
      local.writeUInt16LE(deflated ? 8 : 0, 8);
      local.writeUInt16LE(time, 10);
      local.writeUInt16LE(date, 12);
      local.writeUInt32LE(crc, 14);
      local.writeUInt32LE(data.byteLength, 18);
      local.writeUInt32LE(raw.byteLength, 22);
      local.writeUInt16LE(name.length, 26);

      // Nell'indice: oltre i 4 GB la posizione del file va nel campo extra ZIP64.
      const big = offset >= MAX32;
      const extra = Buffer.alloc(big ? 12 : 0);
      if (big) {
        extra.writeUInt16LE(0x0001, 0);
        extra.writeUInt16LE(8, 2);
        extra.writeBigUInt64LE(BigInt(offset), 4);
      }
      const header = Buffer.alloc(46);
      header.writeUInt32LE(0x02014b50, 0);
      header.writeUInt16LE(big ? 45 : 20, 4); // creato da
      header.writeUInt16LE(big ? 45 : 20, 6); // versione necessaria
      header.writeUInt16LE(0x0800, 8);
      header.writeUInt16LE(deflated ? 8 : 0, 10);
      header.writeUInt16LE(time, 12);
      header.writeUInt16LE(date, 14);
      header.writeUInt32LE(crc, 16);
      header.writeUInt32LE(data.byteLength, 20);
      header.writeUInt32LE(raw.byteLength, 24);
      header.writeUInt16LE(name.length, 28);
      header.writeUInt16LE(extra.length, 30);
      header.writeUInt32LE(big ? MAX32 : offset, 42);
      central.push(header, name, extra);

      controller.enqueue(Buffer.concat([local, name]));
      controller.enqueue(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
      offset += local.length + name.length + data.byteLength;
    },
    async cancel() {
      await iterator.return(undefined);
    },
  });
}

/** Indice dei file e record finale (più quelli ZIP64, se servono). */
function endOfArchive(central: Buffer[], offset: number): Buffer {
  const directory = Buffer.concat(central);
  const count = central.length / 3;
  const zip64 = count >= MAX16 || offset >= MAX32 || directory.length >= MAX32;
  const parts: Buffer[] = [directory];
  if (zip64) {
    const record = Buffer.alloc(56);
    record.writeUInt32LE(0x06064b50, 0);
    record.writeBigUInt64LE(44n, 4);
    record.writeUInt16LE(45, 12);
    record.writeUInt16LE(45, 14);
    record.writeBigUInt64LE(BigInt(count), 24);
    record.writeBigUInt64LE(BigInt(count), 32);
    record.writeBigUInt64LE(BigInt(directory.length), 40);
    record.writeBigUInt64LE(BigInt(offset), 48);
    const locator = Buffer.alloc(20);
    locator.writeUInt32LE(0x07064b50, 0);
    locator.writeBigUInt64LE(BigInt(offset + directory.length), 8);
    locator.writeUInt32LE(1, 16);
    parts.push(record, locator);
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Math.min(count, MAX16), 8);
  end.writeUInt16LE(Math.min(count, MAX16), 10);
  end.writeUInt32LE(Math.min(directory.length, MAX32), 12);
  end.writeUInt32LE(Math.min(offset, MAX32), 16);
  parts.push(end);
  return Buffer.concat(parts);
}
