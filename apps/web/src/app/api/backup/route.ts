import { AppError, exportBackup, restoreBackup } from '@alby/core';
import { getRequestContext } from '@/server/context';

/**
 * Backup completo del server (solo amministratori, sessione via cookie).
 * GET: scarica database e archivio dei file in un unico ZIP, prodotto mentre si scarica.
 * POST: ripristina un backup; il corpo della richiesta è il file .zip (può essere molto grande, quindi non passa
 * da una Server Action, che ha un limite di 64 MB). Permessi e registro accessi: `@alby/core`.
 */

const noStore = { 'Cache-Control': 'private, no-store' };

function errorStatus(err: unknown): number {
  return err instanceof AppError ? err.status : 500;
}

export async function GET() {
  try {
    const file = await exportBackup(await getRequestContext());
    const ascii = file.fileName.replace(/[^\x20-\x7e]/g, '_');
    return new Response(file.stream, {
      headers: {
        ...noStore,
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
      },
    });
  } catch (err) {
    const status = errorStatus(err);
    if (status === 500) console.error('[backup] esportazione non riuscita', err);
    return new Response(status === 401 ? 'Accesso richiesto' : status === 403 ? 'Permessi insufficienti' : 'Errore', {
      status,
      headers: { ...noStore, 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

export async function POST(req: Request) {
  // Solo dalle pagine di questo sito (oltre al cookie SameSite=Lax).
  const origin = req.headers.get('origin');
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  if (!origin || !host || new URL(origin).host !== host) {
    return Response.json({ ok: false, message: 'Richiesta non ammessa' }, { status: 403, headers: noStore });
  }
  if (!req.body) return Response.json({ ok: false, message: 'Nessun file ricevuto' }, { status: 400, headers: noStore });
  try {
    const data = await restoreBackup(await getRequestContext(), req.body);
    return Response.json({ ok: true, data }, { headers: noStore });
  } catch (err) {
    const status = errorStatus(err);
    if (status === 500) console.error('[backup] ripristino non riuscito', err);
    const message = err instanceof AppError ? err.message : 'Ripristino non riuscito: i dati non sono stati modificati.';
    return Response.json({ ok: false, message }, { status, headers: noStore });
  }
}
