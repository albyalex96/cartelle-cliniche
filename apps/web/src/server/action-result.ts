import { AppError, fromDatabaseError } from '@alby/core';
import { ZodError } from 'zod';

/** Risultato restituito da ogni Server Action al componente client che l'ha chiamata. */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string; fields?: Record<string, string> };

/**
 * Esegue la logica di una Server Action trasformando gli errori in un risultato leggibile.
 * Gli errori imprevisti vengono registrati nel log del server e all'utente arriva un messaggio generico
 * (nessun dettaglio interno, e nessun dato sanitario, esce dal server).
 */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    if (err instanceof ZodError) {
      const fields: Record<string, string> = {};
      for (const issue of err.issues) fields[issue.path.join('.') || '_'] ??= issue.message;
      return { ok: false, code: 'VALIDATION', message: 'Alcuni dati non sono validi', fields };
    }
    const known = err instanceof AppError ? err : fromDatabaseError(err);
    if (known) return { ok: false, code: known.code, message: known.message };
    console.error('[action] errore imprevisto', err);
    return { ok: false, code: 'INTERNAL', message: 'Si è verificato un errore imprevisto' };
  }
}
