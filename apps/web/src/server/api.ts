import 'server-only';
import { LOCKDOWN_MESSAGE, type ApiErrorBody } from '@alby/shared';
import { AppError, errorDetails, fromDatabaseError, logger, lookupSession, type RequestContext } from '@alby/core';
import { NextResponse, type NextRequest } from 'next/server';
import { ZodError } from 'zod';
import { clientMeta } from './context';

/**
 * Contesto per l'API dell'app mobile: autenticazione SOLO con `Authorization: Bearer`.
 * Il cookie della webapp viene ignorato di proposito, così un sito esterno non può
 * sfruttare la sessione aperta nel browser (CSRF).
 * Con il blocco accessi attivo, una sessione sospesa riceve 503 `LOCKDOWN` (non 401): il token resta
 * valido e l'app non deve cancellarlo, solo riprovare più tardi.
 * Con la manutenzione attiva le letture funzionano e le modifiche di chi non è amministratore ricevono
 * 503 `MAINTENANCE`: l'app offline dovrà tenerle in coda e inviarle a manutenzione finita, non scartarle.
 */
async function bearerContext(req: NextRequest): Promise<RequestContext> {
  const meta = await clientMeta();
  const auth = req.headers.get('authorization');
  const token = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const session = token ? await lookupSession(token, meta.ip) : null;
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
      logger.error('[api] errore imprevisto', errorDetails(err));
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

/**
 * Richieste da non scrivere nel log: la consultazione dei log stessi (l'aggiornamento live la ripete ogni
 * pochi secondi e riempirebbe il log di sé stessa).
 */
const UNLOGGED = /^\/api\/v1\/admin\/logs(\/|$)/;

/** Una riga per richiesta: metodo, percorso (senza query, che può contenere ricerche per nome), esito e durata. */
function logRequest(req: NextRequest, status: number, startedAt: number, ctx: RequestContext | null) {
  const path = req.nextUrl.pathname;
  if (UNLOGGED.test(path) && req.method === 'GET') return;
  const ms = Math.round(performance.now() - startedAt);
  const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
  logger[level](`${req.method} ${path} → ${status} (${ms} ms)`, { status, ms, ip: ctx?.ip ?? null }, { userId: ctx?.user?.id ?? null });
}

/** Avvolge un Route Handler: contesto Bearer, risposta JSON, errori uniformi, niente cache, una riga di log. */
export function apiRoute<P = Record<string, never>>(handler: Handler<P>) {
  return async (req: NextRequest, segment: { params: Promise<P> }) => {
    const startedAt = performance.now();
    let ctx: RequestContext | null = null;
    let res: Response;
    try {
      ctx = await bearerContext(req);
      const result = await handler(ctx, req, await segment.params);
      if (result instanceof Response) res = result;
      else if (result === undefined) res = new NextResponse(null, { status: 204 });
      else res = NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
    } catch (err) {
      res = errorResponse(err);
    }
    logRequest(req, res.status, startedAt, ctx);
    return res;
  };
}
