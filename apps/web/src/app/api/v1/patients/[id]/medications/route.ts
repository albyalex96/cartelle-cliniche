import { createMedication } from '@alby/core';
import { apiRoute, readJson } from '@/server/api';

/**
 * Aggiunge una terapia dall'app mobile.
 * Permessi, validazione e registro accessi: `createMedication` in @alby/core.
 */
export const POST = apiRoute<{ id: string }>(async (ctx, req, { id }) => createMedication(ctx, id, await readJson(req)));
