import { getHealthService } from '@alby/core';
import { apiRoute } from '@/server/api';

/** Scheda di una prestazione per l'app mobile. */
export const GET = apiRoute<{ id: string }>(async (ctx, _req, { id }) => getHealthService(ctx, id));
