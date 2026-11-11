/** Errore "previsto": il messaggio (in italiano) può essere mostrato all'utente. */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, message: string, code = 'ERROR') {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
  }
}

export const notFound = (what = 'Elemento') => new AppError(404, `${what} non trovato`, 'NOT_FOUND');
export const forbidden = (message = 'Permessi insufficienti') => new AppError(403, message, 'FORBIDDEN');
export const unauthenticated = () => new AppError(401, 'Accesso richiesto', 'UNAUTHENTICATED');

/** Errori del database riconoscibili (vincoli di unicità, record mancanti). */
export function fromDatabaseError(err: unknown): AppError | null {
  const code = (err as { code?: unknown } | null)?.code;
  if (code === 'P2002') {
    return new AppError(409, 'Esiste già un elemento con questi dati (es. email o codice fiscale)', 'CONFLICT');
  }
  if (code === 'P2025') return notFound();
  return null;
}
