import { deleteMedication, updateMedication } from '@alby/core';
import { apiRoute, readJson } from '@/server/api';

/**
 * Modifica ed eliminazione di una terapia dall'app mobile.
 * Permessi, validazione e registro accessi: `updateMedication` / `deleteMedication` in @alby/core.
 */
export const PUT = apiRoute<{ id: string }>(async (ctx, req, { id }) => updateMedication(ctx, id, await readJson(req)));

export const DELETE = apiRoute<{ id: string }>(async (ctx, _req, { id }) => {
  await deleteMedication(ctx, id);
});
