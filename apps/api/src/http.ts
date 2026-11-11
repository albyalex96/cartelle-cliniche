import type { z } from 'zod';

export class HttpError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, message: string, code = 'ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export const notFound = (what = 'Elemento') => new HttpError(404, `${what} non trovato`, 'NOT_FOUND');
export const forbidden = (message = 'Permessi insufficienti') => new HttpError(403, message, 'FORBIDDEN');

/** Valida i dati in ingresso; un errore viene trasformato in 400 dal gestore globale. */
export function parse<T extends z.ZodType>(schema: T, data: unknown): z.output<T> {
  return schema.parse(data);
}
