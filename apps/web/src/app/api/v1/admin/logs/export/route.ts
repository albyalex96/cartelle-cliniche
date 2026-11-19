import { exportLogs } from '@alby/core';
import { apiRoute } from '@/server/api';

/** Log che corrispondono al filtro, come testo (`{ text, count }`), solo amministratori. */
export const GET = apiRoute(async (ctx, req) => exportLogs(ctx, Object.fromEntries(req.nextUrl.searchParams)));
