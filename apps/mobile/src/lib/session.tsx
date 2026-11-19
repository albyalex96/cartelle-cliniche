import type { MeDTO, MobileLoginResponseDTO } from '@alby/shared';
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { ApiError, apiRequest, normalizeServerUrl } from './api';
import { wipeLocalData } from './db';
import { clearLock, getLockSettings, isLockActive, needsLockSetup } from './app-lock';
import { clearStoredSession, loadStoredSession, saveStoredSession, type StoredSession } from './secure-storage';

/**
 * Stato dell'accesso:
 * - `loading`: lettura delle credenziali salvate (splash screen visibile);
 * - `signedOut`: nessun accesso, si mostra il login;
 * - `setupLock`: appena entrati (o aggiornata l'app), si propone di scegliere il PIN dell'app;
 * - `locked`: accesso salvato, ma l'app va sbloccata con il PIN dell'app o l'impronta (all'avvio e dopo un po'
 *   in sottofondo), se il blocco è attivo (vedi app-lock.ts);
 * - `ready`: sbloccata.
 */
export type SessionStatus = 'loading' | 'signedOut' | 'setupLock' | 'locked' | 'ready';

/** Dopo quanto tempo in sottofondo l'app si blocca di nuovo. */
const RELOCK_AFTER_MS = 60_000;

interface SessionValue {
  status: SessionStatus;
  server: string | null;
  user: MeDTO | null;
  token: string | null;
  signIn(server: string, email: string, password: string, code?: string): Promise<void>;
  /** Sblocco riuscito (PIN o impronta verificati dalla schermata di sblocco), o blocco appena configurato. */
  unlocked(): void;
  signOut(): Promise<void>;
  changePassword(currentPassword: string, newPassword: string): Promise<void>;
  /** Il server ha rifiutato il token (scaduto o revocato): uscita con cancellazione dei dati locali. */
  expire(): Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const value = use(SessionContext);
  if (!value) throw new Error('useSession va usato dentro <SessionProvider>');
  return value;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [session, setSession] = useState<StoredSession | null>(null);
  const backgroundSince = useRef<number | null>(null);
  const refreshUserRef = useRef<(s: StoredSession) => Promise<void>>(async () => {});

  useEffect(() => {
    loadStoredSession()
      .then(async (stored) => {
        setSession(stored);
        if (!stored) return setStatus('signedOut');
        const lock = await getLockSettings();
        const next = isLockActive(lock) ? 'locked' : needsLockSetup(lock) ? 'setupLock' : 'ready';
        setStatus(next);
        // Senza blocco si entra subito: i dati dell'utente si aggiornano come dopo uno sblocco.
        if (next === 'ready') void refreshUserRef.current(stored);
      })
      .catch(() => setStatus('signedOut'));
  }, []);

  // Blocco automatico quando l'app resta in sottofondo.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        const since = backgroundSince.current;
        backgroundSince.current = null;
        if (since !== null && Date.now() - since > RELOCK_AFTER_MS) {
          void getLockSettings().then((lock) => {
            if (isLockActive(lock)) setStatus((s) => (s === 'ready' ? 'locked' : s));
          });
        }
      } else if (backgroundSince.current === null) {
        backgroundSince.current = Date.now();
      }
    });
    return () => sub.remove();
  }, []);

  /** Uscita o token non più valido: via credenziali e copia locale (dati e documenti). */
  const forget = useCallback(async () => {
    await wipeLocalData();
    await clearStoredSession();
    await clearLock();
    setSession(null);
    setStatus('signedOut');
  }, []);

  /** Aggiorna i dati dell'utente dal server; token non più valido → uscita. Offline: si resta con i dati salvati. */
  const refreshUser = useCallback(
    async (current: StoredSession) => {
      try {
        const user = await apiRequest<MeDTO>(current.server, '/me', { token: current.token });
        const next = { ...current, user };
        await saveStoredSession(next);
        setSession(next);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) await forget();
      }
    },
    [forget],
  );
  refreshUserRef.current = refreshUser;

  const signIn = useCallback(async (rawServer: string, email: string, password: string, code?: string) => {
    const server = normalizeServerUrl(rawServer);
    const res = await apiRequest<MobileLoginResponseDTO>(server, '/auth/login', {
      method: 'POST',
      body: { email, password, ...(code ? { code } : {}) },
    });
    const next: StoredSession = { server, token: res.token, user: res.user };
    await saveStoredSession(next);
    setSession(next);
    const lock = await getLockSettings();
    setStatus(needsLockSetup(lock) ? 'setupLock' : 'ready');
  }, []);

  const unlocked = useCallback(() => {
    setStatus('ready');
    if (session) void refreshUser(session);
  }, [session, refreshUser]);

  const signOut = useCallback(async () => {
    if (session) {
      // Chiude la sessione anche sul server; se non è raggiungibile, scade da sola.
      await apiRequest(session.server, '/auth/logout', { method: 'POST', token: session.token }).catch(() => {});
    }
    await forget();
  }, [session, forget]);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      if (!session) throw new ApiError(401, 'UNAUTHENTICATED', 'Accesso richiesto');
      const user = await apiRequest<MeDTO>(session.server, '/me/password', {
        method: 'POST',
        token: session.token,
        body: { currentPassword, newPassword },
      });
      const next = { ...session, user };
      await saveStoredSession(next);
      setSession(next);
    },
    [session],
  );

  const value = useMemo<SessionValue>(
    () => ({
      status,
      server: session?.server ?? null,
      user: session?.user ?? null,
      token: session?.token ?? null,
      signIn,
      unlocked,
      signOut,
      changePassword,
      expire: forget,
    }),
    [status, session, signIn, unlocked, signOut, changePassword, forget],
  );

  return <SessionContext value={value}>{children}</SessionContext>;
}
