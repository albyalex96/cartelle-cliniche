import { runMaintenanceNow } from '@alby/core';
import { apiRoute } from '@/server/api';

/** Pulizia immediata (sessioni scadute, registro vecchio, file orfani): `runMaintenanceNow` in @alby/core. */
export const POST = apiRoute(async (ctx) => runMaintenanceNow(ctx));
