import { addReportImage, AppError } from '@alby/core';
import { apiRoute } from '@/server/api';

/**
 * Immagine di un nuovo referto caricata dall'app mobile (multipart: `file`, `studyDate` facoltativa):
 * diventa uno studio di immagini del paziente, da collegare al referto al salvataggio, come nella webapp.
 * Permessi, controllo del formato e registro accessi: `addReportImage` in @alby/core.
 */
export const POST = apiRoute<{ id: string }>(async (ctx, req, { id }) => {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new AppError(400, 'Corpo della richiesta non valido (multipart atteso)', 'BAD_BODY');
  }
  const file = form.get('file');
  if (!(file instanceof File)) throw new AppError(400, 'File mancante', 'NO_FILE');
  const studyDate = form.get('studyDate');
  return addReportImage(ctx, id, {
    kind: 'upload',
    fileName: file.name,
    bytes: new Uint8Array(await file.arrayBuffer()),
    studyDate: typeof studyDate === 'string' && studyDate ? studyDate : undefined,
  });
});
