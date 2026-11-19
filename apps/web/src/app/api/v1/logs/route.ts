import { uploadDeviceLogs } from '@alby/core';
import { apiRoute, readJson } from '@/server/api';

/** Log dell'app inviati dal telefono alla sincronizzazione (`{ entries }`), di qualsiasi utente collegato. */
export const POST = apiRoute(async (ctx, req) => uploadDeviceLogs(ctx, await readJson(req)));
