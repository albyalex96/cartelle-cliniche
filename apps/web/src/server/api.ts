import 'server-only';
import { LOCKDOWN_MESSAGE, type ApiErrorBody } from '@alby/shared';
import { AppError, fromDatabaseError, lookupSession, type RequestContext } from '@alby/core';
import { NextResponse, type NextRequest } from 'next/server';
import { ZodError } from 'zod';
import { clientMeta } from './context';

/**
 * Contesto per l'API dell'app mobile: autenticazione SOLO con `Authorization: Bearer`.
 * Il cookie della webapp viene ignorato di proposito, così un sito esterno non può
 * sfruttare la sessione aperta nel browser (CSRF).
 * Con il blocco accessi attivo, una sessione sospesa riceve 503 `LOCKDOWN` (non 401): il token resta
 * valido e l'app non deve cancellarlo, solo riprovare più tardi.
 */
async function bearerContext(req: NextRequest): Promise<RequestContext> {
  const meta = await clientMeta();
  const auth = req.headers.get('authorization');
  const token = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const session = token ? await lookupSession(token) : null;
  if (session?.status === 'suspended') throw new AppError(503, LOCKDOWN_MESSAGE, 'LOCKDOWN');
  const active = session?.status === 'active' ? session : null;
  return { user: active?.user ?? null, sessionId: active?.sessionId ?? null, ...meta };
}

function errorResponse(err: unknown): NextResponse<ApiErrorBody> {
  let body: ApiErrorBody;
  if (err instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of err.issues) fields[issue.path.join('.') || '_'] ??= issue.message;
    body = { statusCode: 400, code: 'VALIDATION', message: 'Alcuni dati non sono validi', fields };
  } else {
    const known = err instanceof AppError ? err : fromDatabaseError(err);
    if (known) {
      body = { statusCode: known.status, code: known.code, message: known.message };
    } else {
      console.error('[api] errore imprevisto', err);
      body = { statusCode: 500, code: 'INTERNAL', message: 'Si è verificato un errore imprevisto' };
    }
  }
  return NextResponse.json(body, { status: body.statusCode, headers: { 'Cache-Control': 'no-store' } });
}

export async function readJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new AppError(400, 'Corpo della richiesta non valido (JSON atteso)', 'BAD_JSON');
  }
}

type Handler<P> = (ctx: RequestContext, req: NextRequest, params: P) => Promise<unknown>;

/** Avvolge un Route Handler: contesto Bearer, risposta JSON, errori uniformi, niente cache. */
export function apiRoute<P = Record<string, never>>(handler: Handler<P>) {
  return async (req: NextRequest, segment: { params: Promise<P> }) => {
    try {
      const result = await handler(await bearerContext(req), req, await segment.params);
      if (result instanceof Response) return result;
      if (result === undefined) return new NextResponse(null, { status: 204 });
      return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
    } catch (err) {
      return errorResponse(err);
    }
  };
}
