'use server';

import { revokeAllSessions, runMaintenanceNow, setLockdown, setMaintenanceMode, updateServerSettings } from '@alby/core';
import type { MaintenanceResultDTO } from '@alby/shared';
import { revalidatePath } from 'next/cache';
import { runAction, type ActionResult } from '../action-result';
import { getRequestContext } from '../context';

const PAGE = '/admin/impostazioni';

export async function updateSettingsAction(input: unknown): Promise<ActionResult> {
  const result = await runAction(async () => {
    await updateServerSettings(await getRequestContext(), input);
    return undefined;
  });
  if (result.ok) revalidatePath(PAGE);
  return result;
}

export async function revokeAllSessionsAction(): Promise<ActionResult<{ sessions: number }>> {
  const result = await runAction(async () => ({ sessions: await revokeAllSessions(await getRequestContext()) }));
  if (result.ok) revalidatePath(PAGE);
  return result;
}

export async function runMaintenanceAction(): Promise<ActionResult<MaintenanceResultDTO>> {
  const result = await runAction(async () => runMaintenanceNow(await getRequestContext()));
  if (result.ok) revalidatePath(PAGE);
  return result;
}

/** Attiva o disattiva il blocco accessi: cambia la barra laterale di ogni pagina. */
export async function setLockdownAction(active: boolean): Promise<ActionResult> {
  const result = await runAction(async () => {
    await setLockdown(await getRequestContext(), active);
    return undefined;
  });
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}

/** Attiva, aggiorna o termina la modalità manutenzione: cambia la barra laterale e l'avviso di ogni pagina. */
export async function setMaintenanceModeAction(input: unknown): Promise<ActionResult> {
  const result = await runAction(async () => {
    await setMaintenanceMode(await getRequestContext(), input);
    return undefined;
  });
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}
