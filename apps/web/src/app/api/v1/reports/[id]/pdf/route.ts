import { exportReportPdf } from '@alby/core';
import { apiRoute } from '@/server/api';

/** Il referto come PDF impaginato, per l'app mobile (da condividere). Permessi e registro: `exportReportPdf`. */
export const GET = apiRoute<{ id: string }>(async (ctx, _req, { id }) => {
  const file = await exportReportPdf(ctx, id);
  return new Response(new Uint8Array(file.data), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Length': String(file.data.byteLength),
      'Cache-Control': 'private, no-store',
    },
  });
});
