import { AppError, getReportPdf } from '@alby/core';
import { getRequestContext } from '@/server/context';

/**
 * Documento (PDF o immagine JPEG) di un referto, per la webapp (sessione via cookie; sola lettura).
 * Mostrato nel browser accanto al form di revisione e nella pagina del referto, oppure scaricato (?download=1).
 * Permessi e registro accessi: `getReportPdf` in @alby/core.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const file = await getReportPdf(await getRequestContext(), (await params).id);
    // Nome del file solo ASCII nell'intestazione, quello completo con la codifica RFC 5987.
    const ascii = file.fileName.replace(/[^\x20-\x7e]/g, '_');
    return new Response(new Uint8Array(file.data), {
      headers: {
        // Solo i due tipi salvati dal caricamento (PDF o immagine JPEG).
        'Content-Type': file.mimeType === 'image/jpeg' ? 'image/jpeg' : 'application/pdf',
        // ?download=1 → il browser salva il file invece di aprirlo.
        'Content-Disposition': `${new URL(req.url).searchParams.has('download') ? 'attachment' : 'inline'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    const status = err instanceof AppError ? err.status : 500;
    if (status === 500) console.error('[files] errore imprevisto', err);
    return new Response(status === 401 ? 'Accesso richiesto' : status === 404 ? 'Non trovato' : 'Errore', {
      status,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
}
