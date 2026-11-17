import { idSchema, MAX_IMAGE_BYTES, type ReportDraftDTO } from '@alby/shared';
import { z } from 'zod';
import { requireUser } from '../auth/guard';
import type { RequestContext } from '../context';
import { getPrisma } from '../db';
import { AppError, notFound } from '../errors';
import { requirePatientPermission } from './access';
import { writeAudit } from './audit';
import { uploadDicomFiles } from './imaging';
import { documentAsPdf, loadPatientFile } from './reports';

/**
 * Pagine dei PDF come immagini e immagini aggiunte a un referto:
 *  - anteprima delle pagine, per selezionare una zona (OCR o ritaglio);
 *  - foto caricate o ritagli di un PDF, salvati come studio DICOM "Secondary Capture" del paziente:
 *    compaiono tra le sue immagini, si aprono con il visualizzatore e si collegano ai referti.
 */

/** Dimensioni delle pagine di un PDF (in punti), senza disegnarle. `null` se il PDF non si apre. */
export async function describePdfPages(data: Uint8Array): Promise<ReportDraftDTO['pages']> {
  try {
    const { getPageSizes } = await import('@alby/pdf/ocr');
    const pages = await getPageSizes(data);
    return pages.length ? pages : null;
  } catch (err) {
    // Il messaggio è tecnico (moduli, codici): non contiene il testo del documento.
    console.error('[pdf] PDF non leggibile:', err instanceof Error ? `${err.name}: ${err.message}` : err);
    return null;
  }
}

const pageSchema = z.coerce.number().int().min(1).max(1000);

/** Immagine di una pagina di un PDF di referto, da mostrare accanto al form (registra la consultazione). */
export async function getPdfPagePreview(ctx: RequestContext, rawFileId: unknown, rawPage: unknown): Promise<Buffer> {
  const authed = requireUser(ctx);
  const id = idSchema.safeParse(rawFileId);
  const page = pageSchema.safeParse(rawPage);
  if (!id.success || !page.success) throw notFound('Pagina');
  const file = await getPrisma().storedFile.findUnique({ where: { id: id.data } });
  if (!file) throw notFound('File');
  await requirePatientPermission(authed, file.patientId, 'view');
  const { renderPagePreview } = await import('@alby/pdf/ocr');
  let image: Buffer;
  try {
    image = await renderPagePreview(await documentAsPdf(file), page.data, 1400);
  } catch (err) {
    if (err instanceof Error && err.name === 'PageNotFoundError') throw notFound('Pagina');
    throw err;
  }
  await writeAudit(ctx, 'report.file_viewed', { entity: 'file', entityId: file.id, details: { patientId: file.patientId, page: page.data } });
  return image;
}

const fraction = z.number().min(0).max(1);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('').transform(() => undefined));
const cropSchema = z.object({
  fileId: idSchema,
  page: pageSchema,
  region: z.object({ x: fraction, y: fraction, width: z.number().min(0.01).max(1), height: z.number().min(0.01).max(1) }),
  studyDate: isoDate,
});

export type ReportImageSource =
  | { kind: 'upload'; fileName: string; bytes: Uint8Array; studyDate?: string }
  /** Zona di una pagina del PDF in revisione (stesso formato della selezione per l'OCR). */
  | { kind: 'crop'; input: unknown };

/** Nome del file senza percorso ed estensione, per la descrizione dello studio. */
const baseName = (name: string) =>
  (name.split(/[\\/]/).pop() ?? '')
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/[\u0000-\u001f]/g, '')
    .trim()
    .slice(0, 40);

/**
 * Aggiunge un'immagine (foto caricata o ritaglio del PDF in revisione) alle immagini del paziente.
 * Restituisce lo studio creato, da collegare al referto al salvataggio.
 */
export async function addReportImage(ctx: RequestContext, rawPatientId: unknown, source: ReportImageSource): Promise<{ studyId: string }> {
  const authed = requireUser(ctx);
  const patientId = idSchema.safeParse(rawPatientId);
  if (!patientId.success) throw notFound('Paziente');
  await requirePatientPermission(authed, patientId.data, 'edit');

  const image = await import('@alby/pdf/image');
  let picture: { jpeg: Buffer; width: number; height: number };
  let description: string;
  let studyDate: string | undefined;

  if (source.kind === 'upload') {
    if (source.bytes.byteLength === 0) throw new AppError(400, 'Il file è vuoto', 'EMPTY_FILE');
    if (source.bytes.byteLength > MAX_IMAGE_BYTES) {
      throw new AppError(413, `L’immagine supera i ${MAX_IMAGE_BYTES / 1024 / 1024} MB`, 'FILE_TOO_LARGE');
    }
    try {
      picture = await image.imageToJpeg(source.bytes);
    } catch (err) {
      const name = err instanceof Error ? err.name : '';
      if (name === 'UnsupportedImageError' || name === 'ImageTooLargeError') throw new AppError(415, (err as Error).message, 'BAD_IMAGE');
      throw new AppError(415, 'Immagine non leggibile', 'BAD_IMAGE');
    }
    description = baseName(source.fileName) ? `Immagine: ${baseName(source.fileName)}` : 'Immagine caricata';
    studyDate = isoDate.parse(source.studyDate);
  } else {
    const input = cropSchema.parse(source.input);
    // Solo da un PDF di questo paziente, in revisione o del referto in modifica (non da file di altri passando un id a mano).
    const file = await loadPatientFile(patientId.data, input.fileId);
    try {
      picture = await image.renderRegionJpeg(await documentAsPdf(file), input.page, input.region);
    } catch (err) {
      if (err instanceof Error && err.name === 'PageNotFoundError') throw new AppError(400, 'Pagina inesistente', 'PAGE_NOT_FOUND');
      throw err;
    }
    description = `Ritaglio dal PDF, pagina ${input.page}`;
    studyDate = input.studyDate;
  }

  const { writeSecondaryCapture } = await import('@alby/dicom/write');
  const dicom = writeSecondaryCapture({ jpeg: picture.jpeg, width: picture.width, height: picture.height, studyDate, description });
  const result = await uploadDicomFiles(ctx, patientId.data, [{ name: 'immagine.dcm', bytes: dicom.bytes }]);
  if (result.added !== 1) throw new AppError(500, 'Salvataggio dell’immagine non riuscito', 'IMAGE_NOT_SAVED');
  const study = await getPrisma().imagingStudy.findUniqueOrThrow({
    where: { patientId_studyUid: { patientId: patientId.data, studyUid: dicom.studyUid } },
    select: { id: true },
  });
  await writeAudit(ctx, 'imaging.image_added', { entity: 'imaging_study', entityId: study.id, details: { patientId: patientId.data, source: source.kind } });
  return { studyId: study.id };
}
