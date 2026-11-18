'use server';

import {
  beginPasskeyLogin,
  changePassword,
  getConfig,
  login,
  loginWithPasskey,
  logout,
  sessionCookieMaxAge,
  setupAdmin,
  SESSION_COOKIE,
  type SignedIn,
} from '@alby/core';
import type { PasskeyOptionsDTO } from '@alby/shared';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { runAction, type ActionResult } from '../action-result';
import { getRequestContext } from '../context';

async function setSessionCookie({ token }: SignedIn) {
  const cfg = getConfig();
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: cfg.COOKIE_SECURE,
    path: '/',
    // La scadenza reale la decide il server (inattività / durata massima): il cookie dura al massimo quanto la sessione.
    maxAge: await sessionCookieMaxAge(),
  });
}

export async function setupAction(input: unknown): Promise<ActionResult> {
  const result = await runAction(async () => {
    const signedIn = await setupAdmin(await getRequestContext(), input);
    await setSessionCookie(signedIn);
    return undefined;
  });
  if (result.ok) redirect('/pazienti');
  return result;
}

export async function loginAction(input: unknown): Promise<ActionResult> {
  const result = await runAction(async () => {
    const signedIn = await login(await getRequestContext(), input, 'web');
    await setSessionCookie(signedIn);
    return undefined;
  });
  if (result.ok) redirect('/pazienti');
  return result;
}

export async function beginPasskeyLoginAction(): Promise<ActionResult<PasskeyOptionsDTO>> {
  return runAction(async () => beginPasskeyLogin(await getRequestContext()));
}

export async function passkeyLoginAction(input: unknown): Promise<ActionResult> {
  const result = await runAction(async () => {
    const signedIn = await loginWithPasskey(await getRequestContext(), input);
    await setSessionCookie(signedIn);
    return undefined;
  });
  if (result.ok) redirect('/pazienti');
  return result;
}

export async function logoutAction(): Promise<void> {
  await logout(await getRequestContext());
  (await cookies()).delete(SESSION_COOKIE);
  redirect('/login');
}

export async function changePasswordAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    await changePassword(await getRequestContext(), input);
    return undefined;
  });
}
