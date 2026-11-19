import { createUser, listPatients, listUsers } from '@alby/core';
import { apiRoute, readJson } from '@/server/api';

/**
 * Utenti per l'app (solo amministratori), con l'elenco dei pazienti per scegliere gli accessi.
 * Permessi e registro accessi: `listUsers` / `createUser` in @alby/core.
 */
export const GET = apiRoute(async (ctx) => {
  const [users, patients] = await Promise.all([listUsers(ctx), listPatients(ctx)]);
  return { users, patients: patients.map(({ id, firstName, lastName }) => ({ id, firstName, lastName })) };
});

export const POST = apiRoute(async (ctx, req) => createUser(ctx, await readJson(req)));
