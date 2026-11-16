import { useEffect, useState } from 'react';
import { useSync } from './sync-context';

export type LocalResult<T> = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: T };

/**
 * Legge dalla copia locale e rilegge dopo ogni sincronizzazione (così i dati appena scaricati compaiono da soli).
 * `deps`: cosa identifica la lettura (es. l'id del paziente).
 */
export function useLocal<T>(read: () => Promise<T>, deps: readonly unknown[]): LocalResult<T> {
  const { version } = useSync();
  const [result, setResult] = useState<LocalResult<T>>({ status: 'loading' });
  useEffect(() => {
    let current = true;
    read()
      .then((data) => current && setResult({ status: 'ready', data }))
      .catch((err: unknown) => {
        // Solo il messaggio tecnico, mai dati.
        console.error('[dati locali]', err instanceof Error ? err.message : err);
        if (current) setResult({ status: 'error' });
      });
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, ...deps]);
  return result;
}
