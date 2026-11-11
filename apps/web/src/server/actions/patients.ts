'use server';

import { createPatient, deletePatient, updatePatient } from '@alby/core';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { runAction, type ActionResult } from '../action-result';
import { getRequestContext } from '../context';

// I permessi li verifica `@alby/core`: una Server Action è un endpoint pubblico,
// quindi non si fa mai affidamento su controlli fatti solo nell'interfaccia.

export async function createPatientAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const result = await runAction(async () => {
    const patient = await createPatient(await getRequestContext(), input);
    return { id: patient.id };
  });
  if (result.ok) revalidatePath('/pazienti');
  return result;
}

export async function updatePatientAction(id: string, input: unknown): Promise<ActionResult> {
  const result = await runAction(async () => {
    await updatePatient(await getRequestContext(), id, input);
    return undefined;
  });
  if (result.ok) {
    revalidatePath('/pazienti');
    revalidatePath(`/pazienti/${id}`);
  }
  return result;
}

export async function deletePatientAction(id: string): Promise<ActionResult> {
  const result = await runAction(async () => {
    await deletePatient(await getRequestContext(), id);
    return undefined;
  });
  if (result.ok) {
    revalidatePath('/pazienti');
    redirect('/pazienti');
  }
  return result;
}
