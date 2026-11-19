import { importDrugCatalog } from '@alby/core';
import { apiRoute } from '@/server/api';

/** Scarica dall'AIFA l'elenco aggiornato dei farmaci (qualche decina di secondi): `importDrugCatalog` in @alby/core. */
export const POST = apiRoute(async (ctx) => importDrugCatalog(ctx));
