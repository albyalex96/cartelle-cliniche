import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { ApiError } from './api';
import { getMeta } from './db';
import { useSession } from './session';
import { countOutbox } from './outbox';
import { synchronize } from './sync';

/** Al ritorno in primo piano si sincronizza solo se l'ultima volta è più vecchia di così. */
const RESYNC_AFTER_MS = 2 * 60_000;

export interface SyncState {
  syncing: boolean;
  /** Ultima sincronizzazione riuscita (ISO), anche di una sessione precedente dell'app. */
  syncedAt: string | null;
  /** Messaggio dell'ultimo errore; `offline` = server non raggiungibile (si usano i dati salvati). */
  error: { message: string; offline: boolean } | null;
  pendingFiles: number;
  /** Nuovi referti salvati sul telefono, in attesa di invio. */
  pendingReports: number;
  /** Cresce a ogni sincronizzazione applicata: le schermate lo usano per rileggere il database. */
  version: number;
  syncNow(): Promise<void>;
}

const SyncContext = createContext<SyncState | null>(null);

export function useSync(): SyncState {
  const value = use(SyncContext);
  if (!value) throw new Error('useSync va usato dentro <SyncProvider>');
  return value;
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const { server, token, user, expire } = useSession();
  const [syncing, setSyncing] = useState(false);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [error, setError] = useState<SyncState['error']>(null);
  const [pendingFiles, setPendingFiles] = useState(0);
  const [pendingReports, setPendingReports] = useState(0);
  const [version, setVersion] = useState(0);
  const running = useRef<Promise<void> | null>(null);

  const syncNow = useCallback(() => {
    if (!server || !token || !user) return Promise.resolve();
    // Una sola sincronizzazione alla volta: le richieste in più aspettano quella in corso.
    running.current ??= (async () => {
      setSyncing(true);
      try {
        const outcome = await synchronize({ server, token, userId: user.id });
        setPendingFiles(outcome.pendingFiles);
        setPendingReports(outcome.pendingReports);
        setSyncedAt(await getMeta('syncedAt'));
        setError(null);
        setVersion((v) => v + 1);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          await expire();
          return;
        }
        const offline = err instanceof ApiError && err.offline;
        // Anche senza connessione: i referti appena messi in coda devono comparire.
        setPendingReports(await countOutbox().catch(() => 0));
        setVersion((v) => v + 1);
        setError({
          offline,
          message: offline
            ? 'Senza connessione: stai vedendo i dati salvati sul telefono.'
            : err instanceof ApiError
              ? err.message
              : 'Sincronizzazione non riuscita.',
        });
      } finally {
        setSyncing(false);
        running.current = null;
      }
    })();
    return running.current;
  }, [server, token, user, expire]);

  // Dati salvati subito visibili, poi sincronizzazione.
  useEffect(() => {
    getMeta('syncedAt')
      .then(setSyncedAt)
      .catch(() => {});
    void syncNow();
    // Solo all'apertura dell'area protetta: le altre sincronizzazioni le avviano gli eventi sotto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const last = syncedAt ? Date.parse(syncedAt) : 0;
      if (Date.now() - last > RESYNC_AFTER_MS) void syncNow();
    });
    return () => sub.remove();
  }, [syncNow, syncedAt]);

  const value = useMemo<SyncState>(
    () => ({ syncing, syncedAt, error, pendingFiles, pendingReports, version, syncNow }),
    [syncing, syncedAt, error, pendingFiles, pendingReports, version, syncNow],
  );
  return <SyncContext value={value}>{children}</SyncContext>;
}
