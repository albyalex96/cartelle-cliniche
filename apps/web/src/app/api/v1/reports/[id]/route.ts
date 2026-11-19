import { deleteReport, updateReport } from '@alby/core';
import { z } from 'zod';
import { apiRoute, readJson } from '@/server/api';

const bodySchema = z.object({
  /** I valori del form (validati da `updateReport`). */
  input: z.unknown(),
});

/**
 * Modifica ed eliminazione di un referto dall'app mobile (il documento e le immagini restano quelli già collegati).
 * Permessi, validazione e registro accessi: `updateReport` / `deleteReport` in @alby/core.
 */
export const PUT = apiRoute<{ id: string }>(async (ctx, req, { id }) => updateReport(ctx, id, bodySchema.parse(await readJson(req)).input));

export const DELETE = apiRoute<{ id: string }>(async (ctx, _req, { id }) => {
  await deleteReport(ctx, id);
});
