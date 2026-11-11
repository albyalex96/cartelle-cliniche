'use server';

import { createReport, deleteReport, discardReportPdf, updateReport, uploadReportPdf } from '@alby/core';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { runAction, type ActionResult } from '../action-result';
import { getRequestContext } from '../context';

// Permessi e validazione li verifica `@alby/core`: qui solo il collegamento con le pagine.

const reportsTab = (patientId: string) => `/pazienti/${patientId}?tab=storico`;
const reportPage = (patientId: string, reportId: string) => `/pazienti/${patientId}/referti/${reportId}`;

/** Esegue l'azione e, se riesce, porta alla pagina indicata (aggiornando la scheda del paziente). */
async function runAndGo(fn: () => Promise<{ to: string; patientId: string }>): Promise<ActionResult> {
  const result = await runAction(fn);
  if (!result.ok) return result;
  revalidatePath(`/pazienti/${result.data.patientId}`);
  redirect(result.data.to);
}

/**
 * Carica il PDF di un referto e porta alla schermata di revisione.
 * Se lo stesso PDF era già stato importato, porta al referto esistente.
 */
export async function uploadReportPdfAction(patientId: string, formData: FormData): Promise<ActionResult> {
  return runAndGo(async () => {
    const file = formData.get('file');
    if (!(file instanceof File)) throw new Error('File mancante');
    const { file: stored, existingReportId } = await uploadReportPdf(await getRequestContext(), patientId, {
      fileName: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    const to = existingReportId
      ? `${reportPage(patientId, existingReportId)}?duplicato=1`
      : `/pazienti/${patientId}/referti/nuovo?file=${stored.id}`;
    return { to, patientId };
  });
}

/** Annulla un'importazione: elimina il PDF caricato e torna alla scheda. */
export async function discardReportPdfAction(fileId: string): Promise<ActionResult> {
  return runAndGo(async () => {
    const { patientId } = await discardReportPdf(await getRequestContext(), fileId);
    return { to: reportsTab(patientId), patientId };
  });
}

export async function createReportAction(
  patientId: string,
  input: unknown,
  source: { fileId: string | null; parser: { id: string; version: number } | null },
): Promise<ActionResult> {
  return runAndGo(async () => {
    const report = await createReport(await getRequestContext(), patientId, input, source);
    return { to: reportPage(patientId, report.id), patientId };
  });
}

export async function updateReportAction(reportId: string, input: unknown): Promise<ActionResult> {
  return runAndGo(async () => {
    const report = await updateReport(await getRequestContext(), reportId, input);
    return { to: reportPage(report.patientId, report.id), patientId: report.patientId };
  });
}

export async function deleteReportAction(reportId: string): Promise<ActionResult> {
  return runAndGo(async () => {
    const { patientId } = await deleteReport(await getRequestContext(), reportId);
    return { to: reportsTab(patientId), patientId };
  });
}
