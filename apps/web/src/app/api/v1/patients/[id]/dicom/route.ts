import { AppError, uploadDicomFiles } from '@alby/core';
import { apiRoute } from '@/server/api';

/**
 * Immagini DICOM caricate dall'app mobile (multipart, uno o più `files`), come il caricamento a gruppi della webapp.
 * Permessi, controllo dei file e registro accessi: `uploadDicomFiles` in @alby/core.
 */
export const POST = apiRoute<{ id: string }>(async (ctx, req, { id }) => {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new AppError(400, 'Corpo della richiesta non valido (multipart atteso)', 'BAD_BODY');
  }
  const files = form.getAll('files').filter((f): f is File => f instanceof File);
  if (!files.length) throw new AppError(400, 'Nessun file', 'NO_FILE');
  const uploads = await Promise.all(files.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })));
  return uploadDicomFiles(ctx, id, uploads);
});
