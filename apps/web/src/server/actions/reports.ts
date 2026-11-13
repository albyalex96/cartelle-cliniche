'use server';

import {
  createReport,
  deleteReport,
  discardReportPdf,
  prepareReportDraft,
  readScanArea,
  setReportImagingStudies,
  updateReport,
  uploadReportPdf,
} from '@alby/core';
import type { ReportDraftDTO, ScanReadDTO } from '@alby/shared';
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
  /** Studi di immagini da collegare al referto. */
  studyIds: string[] = [],
): Promise<ActionResult> {
  return runAndGo(async () => {
    const ctx = await getRequestContext();
    const report = await createReport(ctx, patientId, input, source);
    if (studyIds.length) await setReportImagingStudies(ctx, report.id, studyIds);
    return { to: reportPage(patientId, report.id), patientId };
  });
}

/** `studyIds`: gli studi di immagini collegati dopo il salvataggio (se omesso, i collegamenti non cambiano). */
export async function updateReportAction(reportId: string, input: unknown, studyIds?: string[]): Promise<ActionResult> {
  return runAndGo(async () => {
    const ctx = await getRequestContext();
    const report = await updateReport(ctx, reportId, input);
    if (studyIds) await setReportImagingStudies(ctx, report.id, studyIds);
    return { to: reportPage(report.patientId, report.id), patientId: report.patientId };
  });
}

export async function deleteReportAction(reportId: string): Promise<ActionResult> {
  return runAndGo(async () => {
    const { patientId } = await deleteReport(await getRequestContext(), reportId);
    return { to: reportsTab(patientId), patientId };
  });
}

/** Legge con l'OCR una zona (o una pagina intera) di un PDF scansionato in revisione. Non salva nulla. */
export async function readScanAreaAction(fileId: string, input: unknown): Promise<ActionResult<ScanReadDTO>> {
  return runAction(async () => readScanArea(await getRequestContext(), fileId, input));
}

/**
 * Modal "Inserisci referto": carica il PDF e restituisce la proposta per il form, senza cambiare pagina.
 * Se lo stesso PDF era già stato importato restituisce l'indirizzo del referto esistente.
 */
export async function uploadReportForDraftAction(
  patientId: string,
  formData: FormData,
): Promise<ActionResult<{ draft: ReportDraftDTO; existingReportUrl: null } | { draft: null; existingReportUrl: string }>> {
  return runAction(async () => {
    const file = formData.get('file');
    if (!(file instanceof File)) throw new Error('File mancante');
    const ctx = await getRequestContext();
    const { file: stored, existingReportId } = await uploadReportPdf(ctx, patientId, {
      fileName: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    if (existingReportId) return { draft: null, existingReportUrl: `${reportPage(patientId, existingReportId)}?duplicato=1` };
    return { draft: await prepareReportDraft(ctx, patientId, stored.id), existingReportUrl: null };
  });
}

/** Modal "Inserisci referto" chiuso senza salvare: elimina il PDF caricato, restando sulla pagina. */
export async function discardDraftPdfAction(fileId: string): Promise<ActionResult> {
  return runAction(async () => {
    await discardReportPdf(await getRequestContext(), fileId);
    return undefined;
  });
}
