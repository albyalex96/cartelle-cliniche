import { AppError, prepareReportDraft, uploadReportPdf } from '@alby/core';
import type { MobileDraftResponseDTO } from '@alby/shared';
import { apiRoute } from '@/server/api';

/**
 * Nuovo referto dall'app mobile: carica il documento (PDF o foto JPEG, con `toPdf=1` salvata come PDF) e
 * restituisce la proposta per il form, come il modal "Inserisci referto" della webapp. Nulla diventa un
 * referto finché non si salva (`POST /patients/:id/reports`); annullando, `DELETE /files/:id`.
 * Permessi e registro accessi: `uploadReportPdf` / `prepareReportDraft` in @alby/core.
 */
export const POST = apiRoute<{ id: string }>(async (ctx, req, { id }): Promise<MobileDraftResponseDTO> => {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new AppError(400, 'Corpo della richiesta non valido (multipart atteso)', 'BAD_BODY');
  }
  const file = form.get('file');
  if (!(file instanceof File)) throw new AppError(400, 'File mancante', 'NO_FILE');
  const { file: stored, existingReportId } = await uploadReportPdf(ctx, id, {
    fileName: file.name,
    bytes: new Uint8Array(await file.arrayBuffer()),
    toPdf: form.get('toPdf') === '1',
  });
  if (existingReportId) return { draft: null, existingReportId };
  return { draft: await prepareReportDraft(ctx, id, stored.id), existingReportId: null };
});
