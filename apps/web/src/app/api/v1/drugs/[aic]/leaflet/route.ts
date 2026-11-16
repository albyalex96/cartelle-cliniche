import { getDrugLeaflet } from '@alby/core';
import { apiRoute } from '@/server/api';

/** Foglietto illustrativo (PDF scaricato dal sito AIFA dal server) per l'app mobile. */
export const GET = apiRoute<{ aic: string }>(async (ctx, _req, { aic }) => {
  const leaflet = await getDrugLeaflet(ctx, aic);
  return new Response(new Uint8Array(leaflet.data), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Length': String(leaflet.data.byteLength), 'Cache-Control': 'private, no-store' },
  });
});
