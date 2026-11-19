import { useCallback, useEffect, useRef, useState } from 'react';
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

/**
 * Ricerca a pagine nella copia locale: aspetta che si smetta di scrivere (200 ms), poi legge la prima pagina;
 * `loadMore` aggiunge le successive scorrendo in fondo. Rilegge da capo dopo ogni sincronizzazione.
 */
export function useLocalSearch<R extends { items: unknown[]; hasMore: boolean }>(query: string, read: (q: string, page: number) => Promise<R>) {
  const { version } = useSync();
  const [result, setResult] = useState<R | null>(null);
  const [items, setItems] = useState<R['items']>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const generation = useRef(0);
  const readRef = useRef(read);
  readRef.current = read;

  const load = useCallback(async (q: string, p: number, gen: number) => {
    setLoading(true);
    try {
      const res = await readRef.current(q, p);
      if (gen !== generation.current) return;
      setResult(res);
      setItems((prev) => (p === 1 ? res.items : ([...prev, ...res.items] as R['items'])));
      setPage(p);
      setFailed(false);
    } catch (err) {
      console.error('[dati locali]', err instanceof Error ? err.message : err);
      if (gen === generation.current) setFailed(true);
    } finally {
      if (gen === generation.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const gen = ++generation.current;
    const timer = setTimeout(() => void load(query.trim(), 1, gen), 200);
    return () => clearTimeout(timer);
  }, [query, load, version]);

  return {
    result,
    items,
    loading,
    failed,
    loadMore: () => {
      if (!loading && result?.hasMore) void load(query.trim(), page + 1, generation.current);
    },
  };
}
