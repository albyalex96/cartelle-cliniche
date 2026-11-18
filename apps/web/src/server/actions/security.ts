'use server';

import {
  beginPasskeyRegistration,
  beginTotpSetup,
  blockIp,
  confirmTotpSetup,
  deletePasskey,
  disableTotp,
  finishPasskeyRegistration,
  unblockIp,
} from '@alby/core';
import type { PasskeyOptionsDTO, TotpSetupDTO } from '@alby/shared';
import { revalidatePath } from 'next/cache';
import { runAction, type ActionResult } from '../action-result';
import { getRequestContext } from '../context';

export async function setIpBlockedAction(ip: string, blocked: boolean): Promise<ActionResult> {
  const result = await runAction(async () => {
    const ctx = await getRequestContext();
    await (blocked ? blockIp(ctx, ip) : unblockIp(ctx, ip));
    return undefined;
  });
  if (result.ok) revalidatePath('/admin/audit-log');
  return result;
}

export async function beginTotpSetupAction(input: unknown): Promise<ActionResult<TotpSetupDTO>> {
  return runAction(async () => beginTotpSetup(await getRequestContext(), input));
}

export async function confirmTotpSetupAction(input: unknown): Promise<ActionResult<{ recoveryCodes: string[] }>> {
  const result = await runAction(async () => confirmTotpSetup(await getRequestContext(), input));
  if (result.ok) revalidatePath('/profilo');
  return result;
}

export async function disableTotpAction(input: unknown): Promise<ActionResult> {
  const result = await runAction(async () => {
    await disableTotp(await getRequestContext(), input);
    return undefined;
  });
  if (result.ok) revalidatePath('/profilo');
  return result;
}

export async function beginPasskeyRegistrationAction(): Promise<ActionResult<PasskeyOptionsDTO>> {
  return runAction(async () => beginPasskeyRegistration(await getRequestContext()));
}

export async function finishPasskeyRegistrationAction(input: unknown): Promise<ActionResult> {
  const result = await runAction(async () => {
    await finishPasskeyRegistration(await getRequestContext(), input);
    return undefined;
  });
  if (result.ok) revalidatePath('/profilo');
  return result;
}

export async function deletePasskeyAction(id: string): Promise<ActionResult> {
  const result = await runAction(async () => {
    await deletePasskey(await getRequestContext(), id);
    return undefined;
  });
  if (result.ok) revalidatePath('/profilo');
  return result;
}
