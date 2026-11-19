import { resetUserSecondFactors } from '@alby/core';
import { apiRoute } from '@/server/api';

/** Toglie all'utente app di autenticazione e passkey: `resetUserSecondFactors` in @alby/core. */
export const DELETE = apiRoute<{ id: string }>(async (ctx, _req, { id }) => {
  await resetUserSecondFactors(ctx, id);
});
