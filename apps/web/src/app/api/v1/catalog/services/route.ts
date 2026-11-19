import { exportHealthServices } from '@alby/core';
import { apiRoute } from '@/server/api';

/** Catalogo delle prestazioni completo per la copia offline dell'app mobile: `?version=` quella già sul telefono. */
export const GET = apiRoute(async (ctx, req) => exportHealthServices(ctx, req.nextUrl.searchParams.get('version')));
