import { clearLogs, listLogs } from '@alby/core';
import { apiRoute } from '@/server/api';

/** Log tecnici (`levels`, `source`, `q`, `after`, `before`, `limit`), solo amministratori: `listLogs` in @alby/core. */
export const GET = apiRoute(async (ctx, req) => listLogs(ctx, Object.fromEntries(req.nextUrl.searchParams)));

/** Cancella i log che corrispondono al filtro (`levels`, `source`, `q`; nessuno = tutti). */
export const DELETE = apiRoute(async (ctx, req) => clearLogs(ctx, Object.fromEntries(req.nextUrl.searchParams)));
