import { getDrugInfo, getDrugOptions } from '@alby/core';
import type { DrugDetailDTO } from '@alby/shared';
import { apiRoute } from '@/server/api';

/** Scheda di un farmaco per l'app mobile: dati AIFA e forme/dosaggi disponibili. */
export const GET = apiRoute<{ aic: string }>(async (ctx, _req, { aic }): Promise<DrugDetailDTO> => {
  const [info, options] = await Promise.all([getDrugInfo(ctx, aic), getDrugOptions(ctx, aic)]);
  return { ...info, variants: options.variants };
});
