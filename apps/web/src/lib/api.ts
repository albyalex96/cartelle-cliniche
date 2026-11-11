import type { ApiErrorBody } from '@alby/shared';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: Record<string, string>;

  constructor(body: ApiErrorBody) {
    super(body.message);
    this.status = body.statusCode;
    this.code = body.code;
    this.fields = body.fields;
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError({ statusCode: 0, code: 'NETWORK', message: 'Server non raggiungibile. Controlla la connessione.' });
  }

  if (res.status === 204) return undefined as T;
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = data as Partial<ApiErrorBody> | null;
    throw new ApiError({
      statusCode: res.status,
      code: err?.code ?? 'ERROR',
      message: err?.message ?? `Errore ${res.status}`,
      fields: err?.fields,
    });
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T = void>(path: string) => request<T>('DELETE', path),
};

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return 'Si è verificato un errore imprevisto';
}
