import { listDrugCatalog } from '@alby/core';
import { apiRoute } from '@/server/api';

/** Elenco dei farmaci AIFA per l'app mobile (solo online): `?q=` testo, `&page=` pagina. */
export const GET = apiRoute(async (ctx, req) => {
  const sp = req.nextUrl.searchParams;
  return listDrugCatalog(ctx, { q: sp.get('q') ?? undefined, page: sp.get('page') ?? undefined });
});
