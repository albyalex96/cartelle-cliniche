'use server';

import { deleteImagingStudy, linkImagingStudyReport, renameImagingStudy, uploadDicomFiles } from '@alby/core';
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

/** Cambia il nome dello studio (vuoto lo toglie). */
export async function renameStudyAction(studyId: string, name: string): Promise<ActionResult> {
  const result = await runAction(async () => renameImagingStudy(await getRequestContext(), studyId, name));
  if (!result.ok) return result;
  // Il nome compare nella scheda, nella pagina dello studio e in quelle dei referti.
  revalidatePath(`/pazienti/${result.data.patientId}`, 'layout');
  return { ok: true, data: undefined };
}

/** Collega lo studio a un referto testuale del paziente (`null` toglie il collegamento). */
export async function linkStudyReportAction(studyId: string, reportId: string | null): Promise<ActionResult> {
  const result = await runAction(async () => linkImagingStudyReport(await getRequestContext(), studyId, reportId));
  if (!result.ok) return result;
  // Cambiano la pagina dello studio e quelle dei referti (vecchio e nuovo collegamento).
  revalidatePath(`/pazienti/${result.data.patientId}`, 'layout');
  return { ok: true, data: undefined };
}
