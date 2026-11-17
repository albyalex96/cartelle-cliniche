import { createReport } from '@alby/core';
import { z } from 'zod';
import { apiRoute, readJson } from '@/server/api';

const bodySchema = z.object({
  /** I valori del form (validati da `createReport`). */
  input: z.unknown(),
  /** Documento caricato prima con `POST /patients/:id/drafts`. */
  fileId: z.string().nullish(),
  parser: z.object({ id: z.string(), version: z.number().int() }).nullish(),
});

/** Salva un nuovo referto dall'app mobile. Permessi, validazione e registro accessi: `createReport` in @alby/core. */
export const POST = apiRoute<{ id: string }>(async (ctx, req, { id }) => {
  const body = bodySchema.parse(await readJson(req));
  return createReport(ctx, id, body.input, { fileId: body.fileId ?? null, parser: body.parser ?? null });
});
