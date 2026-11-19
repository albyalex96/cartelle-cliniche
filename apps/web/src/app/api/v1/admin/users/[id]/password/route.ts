import { resetUserPassword } from '@alby/core';
import { apiRoute, readJson } from '@/server/api';

/** Nuova password temporanea per un utente (dovrà cambiarla): `resetUserPassword` in @alby/core. */
export const POST = apiRoute<{ id: string }>(async (ctx, req, { id }) => {
  await resetUserPassword(ctx, id, await readJson(req));
});
