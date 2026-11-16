import { listHealthServices } from '@alby/core';
import { apiRoute } from '@/server/api';

/** Catalogo delle prestazioni per l'app mobile (solo online): `?q=` testo o codice, `&branch=`, `&page=`. */
export const GET = apiRoute(async (ctx, req) => {
  const sp = req.nextUrl.searchParams;
  return listHealthServices(ctx, {
    q: sp.get('q') ?? undefined,
    branch: sp.get('branch') ?? undefined,
    page: sp.get('page') ?? undefined,
  });
});
