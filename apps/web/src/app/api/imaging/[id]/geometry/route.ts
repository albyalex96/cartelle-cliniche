import { AppError, getImagingGeometry } from '@alby/core';
import { getRequestContext } from '@/server/context';

/**
 * Dimensioni e scala (mm per pixel) di un'immagine DICOM, per misurare le distanze nel
 * visualizzatore (sessione via cookie; sola lettura). Permessi: `getImagingGeometry` in @alby/core.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const geometry = await getImagingGeometry(await getRequestContext(), (await params).id);
    return Response.json(geometry, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err) {
    const status = err instanceof AppError ? err.status : 500;
    if (status === 500) console.error('[immagini] errore imprevisto', err);
    return new Response(status === 401 ? 'Accesso richiesto' : status === 404 ? 'Non trovato' : status === 415 ? 'Dimensioni non disponibili' : 'Errore', {
      status,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
}
