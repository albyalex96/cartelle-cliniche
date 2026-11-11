'use server';

import { deleteImagingStudy, uploadDicomFiles } from '@alby/core';
import type { DicomUploadResultDTO } from '@alby/shared';
import { revalidatePath } from 'next/cache';
import { runAction, type ActionResult } from '../action-result';
import { getRequestContext } from '../context';

// Permessi e controllo dei file li fa `@alby/core`: qui solo il collegamento con le pagine.

/**
 * Salva un gruppo di immagini DICOM. Il browser invia il CD a pezzi (uno dopo l'altro) e
 * aggiorna la pagina alla fine, quindi qui non si rigenera la scheda a ogni gruppo.
 */
export async function uploadDicomBatchAction(patientId: string, formData: FormData): Promise<ActionResult<DicomUploadResultDTO>> {
  return runAction(async () => {
    const files = formData.getAll('files').filter((f): f is File => f instanceof File);
    const uploads = await Promise.all(files.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })));
    return uploadDicomFiles(await getRequestContext(), patientId, uploads);
  });
}

export async function deleteImagingStudyAction(studyId: string): Promise<ActionResult> {
  const result = await runAction(async () => deleteImagingStudy(await getRequestContext(), studyId));
  if (!result.ok) return result;
  revalidatePath(`/pazienti/${result.data.patientId}`);
  return { ok: true, data: undefined };
}
