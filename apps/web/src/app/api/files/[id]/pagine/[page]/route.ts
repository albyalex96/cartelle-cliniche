import { AppError, getScanPagePreview } from '@alby/core';
import { getRequestContext } from '@/server/context';

/**
 * Immagine di una pagina di un PDF scansionato, per il visualizzatore in cui si selezionano le zone
 * da leggere con l'OCR (sessione via cookie; sola lettura). Permessi e registro: `getScanPagePreview`.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; page: string }> }) {
  try {
    const { id, page } = await params;
    const image = await getScanPagePreview(await getRequestContext(), id, page);
    return new Response(new Uint8Array(image), {
      headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-store' },
    });
  } catch (err) {
    const status = err instanceof AppError ? err.status : 500;
    if (status === 500) console.error('[files] errore imprevisto (pagina)', err);
    return new Response(status === 401 ? 'Accesso richiesto' : status === 404 ? 'Non trovato' : 'Errore', {
      status,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
}
