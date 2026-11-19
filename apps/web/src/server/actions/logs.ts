'use server';

import { clearLogs, exportLogs, listLogs } from '@alby/core';
import type { LogListDTO } from '@alby/shared';
import { runAction, type ActionResult } from '../action-result';
import { getRequestContext } from '../context';

/** Elenco dei log (anche per l'aggiornamento live, con `after`). Solo amministratori, verificato in @alby/core. */
export async function listLogsAction(query: unknown): Promise<ActionResult<LogListDTO>> {
  return runAction(async () => listLogs(await getRequestContext(), query));
}

export async function clearLogsAction(filter: unknown): Promise<ActionResult<{ deleted: number }>> {
  return runAction(async () => clearLogs(await getRequestContext(), filter));
}

export async function exportLogsAction(filter: unknown): Promise<ActionResult<{ text: string; count: number }>> {
  return runAction(async () => exportLogs(await getRequestContext(), filter));
}
