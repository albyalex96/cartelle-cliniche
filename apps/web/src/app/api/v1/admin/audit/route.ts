import { listAudit } from '@alby/core';
import { apiRoute } from '@/server/api';

/** Registro accessi a pagine (`page`, `pageSize`, `action`, `userId`), solo amministratori: `listAudit` in @alby/core. */
export const GET = apiRoute(async (ctx, req) => listAudit(ctx, Object.fromEntries(req.nextUrl.searchParams)));
