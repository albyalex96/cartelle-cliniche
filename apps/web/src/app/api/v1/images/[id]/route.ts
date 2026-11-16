import { getImagingPreview } from '@alby/core';
import { apiRoute } from '@/server/api';

/**
 * Immagine di uno studio (anteprima PNG/JPEG ridotta per il telefono) per l'app mobile, che la conserva cifrata.
 * Permessi: `getImagingPreview` in @alby/core.
 */
export const GET = apiRoute<{ id: string }>(async (ctx, _req, { id }) => {
  const image = await getImagingPreview(ctx, id, 'mobile');
  return new Response(new Uint8Array(image.data), {
    headers: {
      'Content-Type': image.mimeType,
      'Content-Length': String(image.data.byteLength),
      'Cache-Control': 'private, no-store',
    },
  });
});
