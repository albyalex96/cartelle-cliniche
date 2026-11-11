import { listPatients } from '@alby/core';
import { apiRoute } from '@/server/api';

export const GET = apiRoute(async (ctx, req) =>
  listPatients(ctx, { q: req.nextUrl.searchParams.get('q') ?? undefined }),
);
