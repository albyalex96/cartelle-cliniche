'use server';

import { createReportTemplate, deleteReportTemplate, updateReportTemplate } from '@alby/core';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { runAction, type ActionResult } from '../action-result';
import { getRequestContext } from '../context';

// Permessi (solo amministratori) e validazione li verifica `@alby/core`.

const LIST = '/admin/tipi-referto';

/** Crea (`id` nullo) o modifica un tipo di referto; se riesce, torna all'elenco. */
export async function saveReportTemplateAction(id: string | null, input: unknown): Promise<ActionResult> {
  const result = await runAction(async () => {
    const ctx = await getRequestContext();
    await (id ? updateReportTemplate(ctx, id, input) : createReportTemplate(ctx, input));
    return undefined;
  });
  if (!result.ok) return result;
  revalidatePath(LIST);
  redirect(LIST);
}

export async function deleteReportTemplateAction(id: string): Promise<ActionResult> {
  const result = await runAction(async () => {
    await deleteReportTemplate(await getRequestContext(), id);
    return undefined;
  });
  if (result.ok) revalidatePath(LIST);
  return result;
}
