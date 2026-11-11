import 'server-only';
import { AppError } from '@alby/core';
import { notFound } from 'next/navigation';

/** Attende una lettura da @alby/core: se la risorsa non esiste (o non è accessibile) mostra la pagina 404. */
export async function orNotFound<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (err) {
    if (err instanceof AppError && err.status === 404) notFound();
    throw err;
  }
}
