/** Byte → base64 a blocchi (String.fromCharCode con troppi argomenti supera i limiti dello stack). */
export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Immagine salvata nel database → sorgente per `<Image>` (resta in memoria: nessun file in chiaro). */
export const dataUri = (mimeType: string, data: Uint8Array) => `data:${mimeType};base64,${toBase64(data)}`;
