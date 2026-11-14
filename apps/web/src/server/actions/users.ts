'use server';

import { closeUserSessions, createUser, resetUserPassword, updateUser } from '@alby/core';
import { revalidatePath } from 'next/cache';
import { runAction, type ActionResult } from '../action-result';
import { getRequestContext } from '../context';

export async function createUserAction(input: unknown): Promise<ActionResult<{ displayName: string }>> {
  const result = await runAction(async () => {
    const user = await createUser(await getRequestContext(), input);
    return { displayName: user.displayName };
  });
  if (result.ok) revalidatePath('/admin/utenti');
  return result;
}

export async function updateUserAction(id: string, input: unknown): Promise<ActionResult<{ displayName: string; active: boolean }>> {
  const result = await runAction(async () => {
    const user = await updateUser(await getRequestContext(), id, input);
    return { displayName: user.displayName, active: user.active };
  });
  if (result.ok) revalidatePath('/admin/utenti');
  return result;
}

export async function resetPasswordAction(id: string, input: unknown): Promise<ActionResult> {
  const result = await runAction(async () => {
    await resetUserPassword(await getRequestContext(), id, input);
    return undefined;
  });
  if (result.ok) revalidatePath('/admin/utenti');
  return result;
}

export async function closeUserSessionsAction(id: string): Promise<ActionResult<{ closed: number }>> {
  return runAction(async () => closeUserSessions(await getRequestContext(), id));
}
