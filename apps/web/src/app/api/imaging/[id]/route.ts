import { AppError, getImagingPreview } from '@alby/core';
import { getRequestContext } from '@/server/context';

/**
 * Anteprima di un'immagine DICOM, per la webapp (sessione via cookie; sola lettura).
 * `?size=thumb` per la miniatura. Permessi: `getImagingPreview` in @alby/core.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const size = new URL(req.url).searchParams.get('size') === 'thumb' ? 'thumb' : 'full';
    const image = await getImagingPreview(await getRequestContext(), (await params).id, size);
    return new Response(new Uint8Array(image.data), {
      headers: { 'Content-Type': image.mimeType, 'Cache-Control': 'private, no-store' },
    });
  } catch (err) {
    const status = err instanceof AppError ? err.status : 500;
    if (status === 500) console.error('[immagini] errore imprevisto', err);
    return new Response(status === 401 ? 'Accesso richiesto' : status === 404 ? 'Non trovato' : status === 415 ? 'Anteprima non disponibile' : 'Errore', {
      status,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
}
