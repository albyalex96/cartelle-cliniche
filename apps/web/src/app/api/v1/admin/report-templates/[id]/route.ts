import { deleteReportTemplate } from '@alby/core';
import { apiRoute } from '@/server/api';

/** Elimina un tipo di referto (i referti già salvati conservano i loro campi): `deleteReportTemplate` in @alby/core. */
export const DELETE = apiRoute<{ id: string }>(async (ctx, _req, { id }) => {
  await deleteReportTemplate(ctx, id);
});
