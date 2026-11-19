import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, apiDownload, apiRequest } from './api';
import { useSession } from './session';

/**
 * Richieste dirette al server, per ciò che non sta nella copia locale (es. nuovo referto, foglietti non ancora
 * scaricati). Token scaduto → uscita, come per la sincronizzazione.
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
  /** Modifiche (nuovo referto, terapie…): JSON o multipart, con un'attesa più lunga per l'OCR e i caricamenti. */
  const send = useCallback(
    <T>(method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, payload: { body?: unknown; form?: FormData; timeoutMs?: number } = {}) =>
      handle(() => apiRequest<T>(server!, path, { method, token, ...payload })),
    [handle, server, token],
  );
  return { get, download, send };
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

/** Ricarica quando si torna sulla schermata (es. dopo aver salvato in un'altra), non al primo ingresso. */
export function useReloadOnFocus(reload: () => void) {
  const first = useRef(true);
  const latest = useRef(reload);
  latest.current = reload;
  useFocusEffect(
    useCallback(() => {
      if (first.current) first.current = false;
      else latest.current();
    }, []),
  );
}
