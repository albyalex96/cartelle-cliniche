import { deletePatient, getPatient, updatePatient } from '@alby/core';
import { apiRoute, readJson } from '@/server/api';

export const GET = apiRoute<{ id: string }>(async (ctx, _req, { id }) => getPatient(ctx, id));

/** Modifica dei dati anagrafici. Permessi, validazione e registro accessi: `updatePatient` in @alby/core. */
export const PUT = apiRoute<{ id: string }>(async (ctx, req, { id }) => updatePatient(ctx, id, await readJson(req)));

/** Elimina il paziente con tutti i suoi dati (solo amministratori): `deletePatient` in @alby/core. */
export const DELETE = apiRoute<{ id: string }>(async (ctx, _req, { id }) => {
  await deletePatient(ctx, id);
});
