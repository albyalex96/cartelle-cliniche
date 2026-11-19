import { importHealthServices } from '@alby/core';
import { apiRoute } from '@/server/api';

/** Scarica l'elenco aggiornato delle prestazioni della Regione Puglia: `importHealthServices` in @alby/core. */
export const POST = apiRoute(async (ctx) => importHealthServices(ctx));
