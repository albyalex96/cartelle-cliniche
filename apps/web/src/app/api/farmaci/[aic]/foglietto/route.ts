import { AppError, getDrugLeaflet } from '@alby/core';
import { getRequestContext } from '@/server/context';

/**
 * Foglietto illustrativo di un farmaco (PDF), da mostrare dentro l'app.
 * Il sito AIFA lo fa solo scaricare: qui viene restituito "inline", così il browser lo apre.
 */
export async function GET(req: Request, { params }: { params: Promise<{ aic: string }> }) {
  try {
    const file = await getDrugLeaflet(await getRequestContext(), (await params).aic);
    const ascii = file.fileName.replace(/[^\x20-\x7e]/g, '_');
    return new Response(new Uint8Array(file.data), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${new URL(req.url).searchParams.has('download') ? 'attachment' : 'inline'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
        // Dato pubblico, ma la risposta richiede l'accesso: solo la cache del browser.
        'Cache-Control': 'private, max-age=86400',
      },
    });
  } catch (err) {
    const status = err instanceof AppError ? err.status : 500;
    if (status === 500) console.error('[farmaci] errore imprevisto', err);
    const message = err instanceof AppError && status !== 500 ? err.message : 'Errore';
    return new Response(status === 401 ? 'Accesso richiesto' : message, {
      status,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
}
