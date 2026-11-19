import { exportDrugCatalog } from '@alby/core';
import { apiRoute } from '@/server/api';

/** Elenco AIFA completo per la copia offline dell'app mobile: `?version=` quella già sul telefono. */
export const GET = apiRoute(async (ctx, req) => exportDrugCatalog(ctx, req.nextUrl.searchParams.get('version')));
