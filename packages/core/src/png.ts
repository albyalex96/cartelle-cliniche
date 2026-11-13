import { crc32, deflateSync } from 'node:zlib';

/** Scrive un PNG a 8 bit (grigi o RGB) da pixel riga per riga: basta zlib, nessuna libreria. */
export function encodePng(width: number, height: number, channels: 1 | 3, pixels: Uint8Array): Buffer {
  const stride = width * channels;
  // Ogni riga è preceduta dal tipo di filtro (0 = nessuno).
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) raw.set(pixels.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);

  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit per canale
  header[9] = channels === 1 ? 0 : 2; // 0 = grigi, 2 = RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
