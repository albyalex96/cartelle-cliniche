import type { ApiErrorBody } from '@alby/shared';

/** Errore restituito dal server (o di rete, con `status` 0 e `code` 'NETWORK'). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string>,
    /** Errori di rete: il motivo tecnico dato dal telefono (timeout, allegato non leggibile…). */
    readonly detail?: string,
  ) {
    super(message);
  }

  /** Il server non è raggiungibile: si continua offline con la copia locale. */
  get offline() {
    return this.status === 0;
  }
}

const TIMEOUT_MS = 20_000;

/**
 * Indirizzo del server scritto dall'utente → forma canonica senza "/" finale.
 * In produzione solo HTTPS: il token non deve mai viaggiare in chiaro. HTTP è ammesso solo nella build
 * di sviluppo, per il server avviato sul PC in rete locale.
 */
export function normalizeServerUrl(raw: string): string {
  let text = raw.trim();
  if (!/^[a-z]+:\/\//i.test(text)) text = `https://${text}`;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new ApiError(0, 'BAD_URL', 'Indirizzo del server non valido');
  }
  if (url.protocol !== 'https:' && !(__DEV__ && url.protocol === 'http:')) {
    throw new ApiError(0, 'BAD_URL', 'L’indirizzo del server deve iniziare con https://');
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  token?: string | null;
  /** Corpo JSON. */
  body?: unknown;
  /** Corpo multipart (caricamento di un documento), in alternativa a `body`. */
  form?: FormData;
  /** Attesa massima (predefinita 20 s): l'OCR di una pagina può richiedere di più. */
  timeoutMs?: number;
}

/** Scarica un file binario dall'API (documenti e immagini dei referti), con il suo tipo. */
export async function apiDownload(server: string, path: string, token: string): Promise<{ data: Uint8Array; mimeType: string }> {
  let res: Response;
  try {
    res = await fetch(`${server}/api/v1${path}`, { headers: { Authorization: `Bearer ${token}` } });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Server non raggiungibile');
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as Partial<ApiErrorBody> | null;
    throw new ApiError(res.status, body?.code ?? 'HTTP', body?.message ?? `Errore del server (${res.status})`);
  }
  const mimeType = res.headers.get('content-type')?.split(';')[0]?.trim() || 'application/octet-stream';
  return { data: new Uint8Array(await res.arrayBuffer()), mimeType };
}

/** Chiamata all'API `/api/v1` del server: JSON in entrata e in uscita, errori uniformi. */
export async function apiRequest<T>(server: string, path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${server}/api/v1${path}`, {
      method: opts.method ?? 'GET',
      headers,
      // Per il multipart il Content-Type (con il separatore) lo mette fetch.
      body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
      signal: controller.signal,
    });
  } catch (err) {
    // Per l'app è comunque "offline", ma il motivo vero si conserva: serve a capire un invio che non parte.
    const detail = controller.signal.aborted ? 'tempo scaduto' : err instanceof Error ? err.message : String(err);
    throw new ApiError(0, 'NETWORK', 'Server non raggiungibile. Controlla la connessione e l’indirizzo.', undefined, detail);
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 204) return undefined as T;
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // Risposta non JSON: probabilmente non è il server delle cartelle cliniche (o un proxy in errore).
  }
  if (!res.ok) {
    const body = data as Partial<ApiErrorBody> | null;
    throw new ApiError(
      res.status,
      body?.code ?? 'HTTP',
      body?.message ?? `Errore del server (${res.status})`,
      body?.fields,
    );
  }
  if (data === null) throw new ApiError(res.status, 'BAD_RESPONSE', 'Risposta del server non valida');
  return data as T;
}
