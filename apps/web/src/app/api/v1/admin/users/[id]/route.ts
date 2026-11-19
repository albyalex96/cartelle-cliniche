import { updateUser } from '@alby/core';
import { apiRoute, readJson } from '@/server/api';

/** Modifica di un utente (nome, email, ruolo, attivo, accessi): `updateUser` in @alby/core. */
export const PATCH = apiRoute<{ id: string }>(async (ctx, req, { id }) => updateUser(ctx, id, await readJson(req)));
