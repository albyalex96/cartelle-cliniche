import { getPdfPagePreview } from '@alby/core';
import { apiRoute } from '@/server/api';

/**
 * Immagine (JPEG) di una pagina del PDF di un referto, per la compilazione sequenziale dell'app mobile:
 * la pagina si mostra e se ne legge il testo sul telefono. Permessi e registro accessi: `getPdfPagePreview`.
 */
export const GET = apiRoute<{ id: string; page: string }>(async (ctx, _req, { id, page }) => {
  const image = await getPdfPagePreview(ctx, id, page);
  return new Response(new Uint8Array(image), {
    headers: { 'Content-Type': 'image/jpeg', 'Content-Length': String(image.byteLength), 'Cache-Control': 'private, no-store' },
  });
});
