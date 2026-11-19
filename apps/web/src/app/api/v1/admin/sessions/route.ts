import { revokeAllSessions } from '@alby/core';
import { apiRoute } from '@/server/api';

/** Chiude le sessioni di tutti gli utenti tranne la propria: `revokeAllSessions` in @alby/core. */
export const DELETE = apiRoute(async (ctx) => ({ sessions: await revokeAllSessions(ctx) }));
