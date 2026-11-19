import { stopMedication } from '@alby/core';
import { apiRoute } from '@/server/api';

/** Sospende una terapia (fine = oggi). Permessi e registro accessi: `stopMedication` in @alby/core. */
export const POST = apiRoute<{ id: string }>(async (ctx, _req, { id }) => stopMedication(ctx, id));
