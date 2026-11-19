import { importReportTemplates } from '@alby/core';
import { z } from 'zod';
import { apiRoute, readJson } from '@/server/api';

const bodySchema = z.object({ text: z.string() });

/** Importa tipi di referto dal codice JSON esportato (dalla webapp): `importReportTemplates` in @alby/core. */
export const POST = apiRoute(async (ctx, req) => importReportTemplates(ctx, bodySchema.parse(await readJson(req)).text));
