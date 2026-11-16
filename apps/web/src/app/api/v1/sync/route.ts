import { syncChanges } from '@alby/core';
import { apiRoute } from '@/server/api';

/** Sincronizzazione incrementale dell'app mobile: `?since=<cursore>` (vedi `SyncResponseDTO`). */
export const GET = apiRoute(async (ctx, req) =>
  syncChanges(ctx, { since: req.nextUrl.searchParams.get('since') ?? undefined }),
);
