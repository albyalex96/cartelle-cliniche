import { discardReportPdf, getReportPdf } from '@alby/core';
import { apiRoute } from '@/server/api';

/**
 * Documento di un referto (PDF o foto JPEG) per l'app mobile, che lo conserva cifrato per la consultazione offline.
 * Permessi e registro accessi: `getReportPdf` in @alby/core.
 */
export const GET = apiRoute<{ id: string }>(async (ctx, _req, { id }) => {
  const file = await getReportPdf(ctx, id);
  return new Response(new Uint8Array(file.data), {
    headers: {
      // Solo i due tipi salvati dal caricamento.
      'Content-Type': file.mimeType === 'image/jpeg' ? 'image/jpeg' : 'application/pdf',
      'Content-Length': String(file.data.byteLength),
      'Cache-Control': 'private, no-store',
    },
  });
});

/** Nuovo referto annullato nell'app: elimina il documento caricato (solo se non è già di un referto). */
export const DELETE = apiRoute<{ id: string }>(async (ctx, _req, { id }) => {
  await discardReportPdf(ctx, id);
});
