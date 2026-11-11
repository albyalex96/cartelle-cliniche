import type { AuthedContext, RequestContext } from '../context';
import { AppError, forbidden, unauthenticated } from '../errors';

interface RequireOptions {
  /** Consenti l'operazione anche se l'utente deve ancora cambiare la password. */
  allowPendingPasswordChange?: boolean;
}

export function requireUser(ctx: RequestContext, opts: RequireOptions = {}): AuthedContext {
  if (!ctx.user) throw unauthenticated();
  if (ctx.user.mustChangePassword && !opts.allowPendingPasswordChange) {
    throw new AppError(403, 'Devi cambiare la password prima di continuare', 'PASSWORD_CHANGE_REQUIRED');
  }
  return ctx as AuthedContext;
}

export function requireAdmin(ctx: RequestContext): AuthedContext {
  const authed = requireUser(ctx);
  if (authed.user.role !== 'ADMIN') throw forbidden();
  return authed;
}
