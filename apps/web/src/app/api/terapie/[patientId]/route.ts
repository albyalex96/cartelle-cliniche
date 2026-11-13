import { AppError, getTherapyPdf } from '@alby/core';
import { getRequestContext } from '@/server/context';

/**
 * PDF con le terapie in corso di un paziente, da scaricare (sessione via cookie; sola lettura).
 * Permessi e registro accessi: `getTherapyPdf` in @alby/core.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ patientId: string }> }) {
  try {
    const file = await getTherapyPdf(await getRequestContext(), (await params).patientId);
    const ascii = file.fileName.replace(/[^\x20-\x7e]/g, '_');
    return new Response(new Uint8Array(file.data), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    const status = err instanceof AppError ? err.status : 500;
    if (status === 500) console.error('[terapie] errore imprevisto', err);
    return new Response(status === 401 ? 'Accesso richiesto' : status === 404 ? 'Non trovato' : 'Errore', {
      status,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
}
