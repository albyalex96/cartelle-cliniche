import { AppError, exportPatientRecord } from '@alby/core';
import { getRequestContext } from '@/server/context';

/**
 * Cartella clinica di un paziente in un archivio ZIP, da scaricare (sessione via cookie; sola lettura).
 * Parametri: `dal` e `al` (AAAA-MM-GG, facoltativi), `pdf` e `immagini` (caselle del modulo).
 * L'archivio viene prodotto mentre si scarica: anche con molte immagini non resta tutto in memoria.
 * Permessi, validazione e registro accessi: `exportPatientRecord` in @alby/core.
 */
export async function GET(req: Request, { params }: { params: Promise<{ patientId: string }> }) {
  try {
    const query = new URL(req.url).searchParams;
    const file = await exportPatientRecord(await getRequestContext(), (await params).patientId, {
      from: query.get('dal') ?? '',
      to: query.get('al') ?? '',
      pdf: query.get('pdf') ?? '',
      images: query.get('immagini') ?? '',
    });
    const ascii = file.fileName.replace(/[^\x20-\x7e]/g, '_');
    return new Response(file.stream, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    const status = err instanceof AppError ? err.status : err instanceof Error && err.name === 'ZodError' ? 400 : 500;
    if (status === 500) console.error('[cartella] errore imprevisto', err);
    return new Response(status === 401 ? 'Accesso richiesto' : status === 404 ? 'Non trovato' : status === 400 ? 'Periodo non valido' : 'Errore', {
      status,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
}
