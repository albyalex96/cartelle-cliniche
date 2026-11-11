'use server';

import { createMedication, deleteMedication, importDrugCatalog, searchDrugs, stopMedication, updateMedication } from '@alby/core';
import type { DrugCatalogStatusDTO, DrugSearchResultDTO } from '@alby/shared';
import { revalidatePath } from 'next/cache';
import { runAction, type ActionResult } from '../action-result';
import { getRequestContext } from '../context';

// Permessi e validazione li verifica `@alby/core`: qui solo il collegamento con le pagine.

async function runAndRefresh(fn: () => Promise<{ patientId: string }>): Promise<ActionResult> {
  const result = await runAction(fn);
  if (!result.ok) return result;
  revalidatePath(`/pazienti/${result.data.patientId}`);
  return { ok: true, data: undefined };
}

export async function createMedicationAction(patientId: string, input: unknown): Promise<ActionResult> {
  return runAndRefresh(async () => createMedication(await getRequestContext(), patientId, input));
}

export async function updateMedicationAction(id: string, input: unknown): Promise<ActionResult> {
  return runAndRefresh(async () => updateMedication(await getRequestContext(), id, input));
}

export async function stopMedicationAction(id: string): Promise<ActionResult> {
  return runAndRefresh(async () => stopMedication(await getRequestContext(), id));
}

export async function deleteMedicationAction(id: string): Promise<ActionResult> {
  return runAndRefresh(async () => deleteMedication(await getRequestContext(), id));
}

/** Ricerca nell'elenco AIFA, mentre si scrive il nome del farmaco. */
export async function searchDrugsAction(query: string): Promise<ActionResult<DrugSearchResultDTO>> {
  return runAction(async () => searchDrugs(await getRequestContext(), query));
}

/** Scarica dall'AIFA l'elenco aggiornato dei farmaci (solo amministratori; richiede qualche decina di secondi). */
export async function importDrugCatalogAction(): Promise<ActionResult<DrugCatalogStatusDTO>> {
  const result = await runAction(async () => importDrugCatalog(await getRequestContext()));
  if (result.ok) revalidatePath('/admin/farmaci');
  return result;
}
