import 'server-only';
import {
  getConfig,
  needsSetup,
  requireAdmin,
  lookupSession,
  requireUser,
  SESSION_COOKIE,
  type AuthedContext,
  type RequestContext,
} from '@alby/core';
import { cookies, headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';

/**
 * IP del client. Gli header X-Forwarded-For / X-Real-IP li può scrivere chiunque:
 * si leggono solo se l'app è dietro un reverse proxy fidato (TRUST_PROXY=true),
 * altrimenti l'IP resta sconosciuto (e i limiti di tentativi diventano globali, quindi più severi).
 */
export async function clientMeta(): Promise<{ ip: string | null; userAgent: string | null }> {
  const h = await headers();
  let ip: string | null = null;
  if (getConfig().TRUST_PROXY) {
    ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || null;
  }
  return { ip, userAgent: h.get('user-agent')?.slice(0, 300) ?? null };
}

/** Sessione del cookie, verificata una sola volta per richiesta. */
const currentSession = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? lookupSession(token) : ({ status: 'none' } as const);
});

/** Il login c'è ma è sospeso dal blocco accessi (vale come non autenticato). */
export async function isSessionSuspended(): Promise<boolean> {
  return (await currentSession()).status === 'suspended';
}

/**
 * Contesto della richiesta corrente (utente dal cookie di sessione).
 * `cache` lo calcola una sola volta per richiesta, anche se lo chiedono più componenti.
 */
export const getRequestContext = cache(async (): Promise<RequestContext> => {
  const [meta, session] = await Promise.all([clientMeta(), currentSession()]);
  const active = session.status === 'active' ? session : null;
  return {
    user: active?.user ?? null,
    sessionId: active?.sessionId ?? null,
    ...meta,
  };
});

/** Per le pagine dell'area riservata: porta al setup, al login, all'avviso di blocco o al cambio password se serve. */
export async function requirePageUser(): Promise<AuthedContext> {
  const ctx = await getRequestContext();
  if (!ctx.user && (await isSessionSuspended())) redirect('/accesso-sospeso');
  if (!ctx.user) redirect((await needsSetup()) ? '/setup' : '/login');
  if (ctx.user.mustChangePassword) redirect('/cambio-password');
  return requireUser(ctx);
}

export async function requirePageAdmin(): Promise<AuthedContext> {
  const ctx = await requirePageUser();
  if (ctx.user.role !== 'ADMIN') notFound();
  return requireAdmin(ctx);
}
