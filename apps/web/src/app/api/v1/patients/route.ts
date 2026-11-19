import { createPatient, listPatients } from '@alby/core';
import { apiRoute, readJson } from '@/server/api';

export const GET = apiRoute(async (ctx, req) =>
  listPatients(ctx, { q: req.nextUrl.searchParams.get('q') ?? undefined }),
);

/** Nuovo paziente dall'app (solo amministratori). Permessi, validazione e registro: `createPatient` in @alby/core. */
export const POST = apiRoute(async (ctx, req) => createPatient(ctx, await readJson(req)));
