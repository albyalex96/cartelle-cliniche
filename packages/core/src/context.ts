import type { MeDTO } from '@alby/shared';

export type AuthUser = MeDTO;

/**
 * Chi sta facendo la richiesta e da dove. Ogni servizio la riceve: è così che
 * vengono applicati permessi e registro accessi, sia per la webapp sia per l'API mobile.
 */
export interface RequestContext {
  user: AuthUser | null;
  sessionId: string | null;
  ip: string | null;
  userAgent: string | null;
}

/** Contesto con utente autenticato (garantito dai controlli in `guard.ts`). */
export type AuthedContext = RequestContext & { user: AuthUser };
