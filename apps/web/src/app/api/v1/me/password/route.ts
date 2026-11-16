import { changePassword } from '@alby/core';
import { apiRoute, readJson } from '@/server/api';

/** Cambio password dall'app mobile (anche quello obbligatorio al primo accesso). Chiude le sessioni degli altri dispositivi. */
export const POST = apiRoute(async (ctx, req) => changePassword(ctx, await readJson(req)));
