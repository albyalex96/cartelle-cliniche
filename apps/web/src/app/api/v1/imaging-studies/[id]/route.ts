import { deleteImagingStudy, linkImagingStudyReport, renameImagingStudy } from '@alby/core';
import { z } from 'zod';
import { apiRoute, readJson } from '@/server/api';

const bodySchema = z.object({
  /** Nuovo nome dello studio (vuoto lo toglie). */
  name: z.string().optional(),
  /** Referto a cui collegarlo (`null` toglie il collegamento). */
  reportId: z.string().nullable().optional(),
});

/**
 * Rinomina uno studio di immagini e/o lo collega a un referto, dall'app mobile.
 * Permessi, validazione e registro accessi: `renameImagingStudy` / `linkImagingStudyReport` in @alby/core.
 */
export const PATCH = apiRoute<{ id: string }>(async (ctx, req, { id }) => {
  const body = bodySchema.parse(await readJson(req));
  if (body.name !== undefined) await renameImagingStudy(ctx, id, body.name);
  if (body.reportId !== undefined) await linkImagingStudyReport(ctx, id, body.reportId);
});

/** Elimina lo studio con le sue immagini: `deleteImagingStudy` in @alby/core. */
export const DELETE = apiRoute<{ id: string }>(async (ctx, _req, { id }) => {
  await deleteImagingStudy(ctx, id);
});
