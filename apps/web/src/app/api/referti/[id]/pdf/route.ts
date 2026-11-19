import { AppError, errorDetails, exportReportPdf, logger } from '@alby/core';
import { getRequestContext } from '@/server/context';

/**
 * Il referto come PDF impaginato, per la webapp (sessione via cookie): si apre nel browser, o si scarica
 * con ?download=1. Permessi e registro accessi: `exportReportPdf` in @alby/core.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const file = await exportReportPdf(await getRequestContext(), (await params).id);
    // Nome del file solo ASCII nell'intestazione, quello completo con la codifica RFC 5987.
    const ascii = file.fileName.replace(/[^\x20-\x7e]/g, '_');
    return new Response(new Uint8Array(file.data), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${new URL(req.url).searchParams.has('download') ? 'attachment' : 'inline'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    const status = err instanceof AppError ? err.status : 500;
    if (status === 500) logger.error('[referti] PDF non generato', errorDetails(err));
    return new Response(status === 401 ? 'Accesso richiesto' : status === 404 ? 'Non trovato' : 'Errore', {
      status,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
}
