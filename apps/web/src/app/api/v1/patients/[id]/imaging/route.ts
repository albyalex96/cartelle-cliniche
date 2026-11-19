import { listImagingStudies } from '@alby/core';
import { apiRoute } from '@/server/api';

/**
 * Tutti gli studi di immagini del paziente, anche quelli non collegati a un referto (che il telefono non conserva):
 * per gestirli dall'app, online. Permessi e registro accessi: `listImagingStudies` in @alby/core.
 */
export const GET = apiRoute<{ id: string }>(async (ctx, _req, { id }) => listImagingStudies(ctx, id));
