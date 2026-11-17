import { createReport, setReportImagingStudies } from '@alby/core';
import { z } from 'zod';
import { apiRoute, readJson } from '@/server/api';

const bodySchema = z.object({
  /** I valori del form (validati da `createReport`). */
  input: z.unknown(),
  /** Documento caricato prima con `POST /patients/:id/drafts`. */
  fileId: z.string().nullish(),
  parser: z.object({ id: z.string(), version: z.number().int() }).nullish(),
  /** Studi di immagini (caricati prima con `POST /patients/:id/images`) da collegare al referto. */
  studyIds: z.array(z.string()).max(200).default([]),
});

/**
 * Salva un nuovo referto dall'app mobile, con le immagini collegate.
 * Permessi, validazione e registro accessi: `createReport` / `setReportImagingStudies` in @alby/core.
 */
export const POST = apiRoute<{ id: string }>(async (ctx, req, { id }) => {
  const body = bodySchema.parse(await readJson(req));
  const report = await createReport(ctx, id, body.input, { fileId: body.fileId ?? null, parser: body.parser ?? null });
  if (body.studyIds.length) await setReportImagingStudies(ctx, report.id, body.studyIds);
  return report;
});
