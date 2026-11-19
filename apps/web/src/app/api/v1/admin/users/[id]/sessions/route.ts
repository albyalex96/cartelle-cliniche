import { closeUserSessions } from '@alby/core';
import { apiRoute } from '@/server/api';

/** Chiude tutte le sessioni dell'utente (sito e app): `closeUserSessions` in @alby/core. */
export const DELETE = apiRoute<{ id: string }>(async (ctx, _req, { id }) => closeUserSessions(ctx, id));
