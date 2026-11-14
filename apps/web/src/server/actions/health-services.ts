'use server';

import { importHealthServices } from '@alby/core';
import type { HealthServiceCatalogStatusDTO } from '@alby/shared';
import { revalidatePath } from 'next/cache';
import { runAction, type ActionResult } from '../action-result';
import { getRequestContext } from '../context';

/** Scarica dal portale della Regione Puglia il catalogo aggiornato delle prestazioni (solo amministratori). */
export async function importHealthServicesAction(): Promise<ActionResult<HealthServiceCatalogStatusDTO>> {
  const result = await runAction(async () => importHealthServices(await getRequestContext()));
  if (result.ok) {
    revalidatePath('/prestazioni');
    revalidatePath('/admin/impostazioni');
  }
  return result;
}
