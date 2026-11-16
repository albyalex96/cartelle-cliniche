import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, apiDownload, apiRequest } from './api';
import { useSession } from './session';

/**
 * Consultazioni solo online (elenco farmaci, catalogo prestazioni): troppi dati per una copia sul telefono,
 * si chiedono al server quando servono. Token scaduto → uscita, come per la sincronizzazione.
 */
export function useApi() {
  const { server, token, expire } = useSession();
  const handle = useCallback(
    async <T>(run: () => Promise<T>): Promise<T> => {
      try {
        return await run();
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) await expire();
        throw err;
      }
    },
    [expire],
  );
  const get = useCallback(<T>(path: string) => handle(() => apiRequest<T>(server!, path, { token })), [handle, server, token]);
  const download = useCallback((path: string) => handle(() => apiDownload(server!, path, token!)), [handle, server, token]);
  return { get, download };
}

export const onlineErrorMessage = (err: unknown) =>
  err instanceof ApiError
    ? err.offline
      ? 'Serve la connessione: questa sezione si consulta solo online.'
      : err.message
    : 'Richiesta non riuscita.';

export type OnlineState<T> = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: T };

/** Una richiesta al server, ripetibile (`reload`). */
export function useOnline<T>(path: string | null) {
  const { get } = useApi();
  const [state, setState] = useState<OnlineState<T>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!path) return;
    let current = true;
    setState({ status: 'loading' });
    get<T>(path)
      .then((data) => current && setState({ status: 'ready', data }))
      .catch((err: unknown) => current && setState({ status: 'error', message: onlineErrorMessage(err) }));
    return () => {
      current = false;
    };
  }, [get, path, attempt]);
  return { state, reload: () => setAttempt((a) => a + 1) };
}

/**
 * Ricerca a pagine: aspetta che si smetta di scrivere (300 ms), poi chiede la prima pagina; `loadMore` aggiunge
 * le successive scorrendo in fondo. `buildPath(q, page)` costruisce l'indirizzo, `pick` estrae elementi e "ce ne sono altri".
 */
export function usePagedSearch<R, I>(
  query: string,
  buildPath: (q: string, page: number) => string,
  pick: (res: R, page: number) => { items: I[]; hasMore: boolean },
) {
  const { get } = useApi();
  const [items, setItems] = useState<I[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);
  const pickRef = useRef(pick);
  pickRef.current = pick;
  const pathRef = useRef(buildPath);
  pathRef.current = buildPath;

  const load = useCallback(
    async (q: string, p: number, gen: number) => {
      setLoading(true);
      setError(null);
      try {
        const res = await get<R>(pathRef.current(q, p));
        if (gen !== generation.current) return;
        const { items: got, hasMore: more } = pickRef.current(res, p);
        setItems((prev) => (p === 1 ? got : [...prev, ...got]));
        setPage(p);
        setHasMore(more);
      } catch (err) {
        if (gen === generation.current) setError(onlineErrorMessage(err));
      } finally {
        if (gen === generation.current) setLoading(false);
      }
    },
    [get],
  );

  useEffect(() => {
    const gen = ++generation.current;
    const timer = setTimeout(() => void load(query.trim(), 1, gen), 300);
    return () => clearTimeout(timer);
  }, [query, load, attempt]);

  return {
    items,
    loading,
    error,
    hasMore,
    loadMore: () => {
      if (!loading && hasMore && !error) void load(query.trim(), page + 1, generation.current);
    },
    retry: () => setAttempt((a) => a + 1),
  };
}
