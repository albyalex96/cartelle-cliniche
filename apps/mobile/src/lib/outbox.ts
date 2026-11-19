import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';
import { ApiError, apiRequest } from './api';
import { getDb } from './db';
import { logger } from './logger';
import { saveReport, uploadDocument, uploadImage, type DraftValues, type Send } from './new-report';
import { deleteTempDocument, writeTempDocument } from './temp-documents';
import type { ReportField } from '@alby/shared';

/**
 * Nuovi referti salvati SENZA connessione: restano nel database cifrato del telefono, con i loro allegati
 * (PDF e immagini come BLOB), e vengono inviati al server alla sincronizzazione successiva.
 * Ogni passo inviato si annota (PDF → id del file, immagine → id dello studio): se la rete cade a metà,
 * al tentativo successivo non si ricarica due volte la stessa cosa.
 */

export interface OutboxAttachment {
  uri: string;
  name: string;
  mimeType: string;
}

interface OutboxPayload {
  values: DraftValues;
  fields: ReportField[];
  parser: { id: string; version: number } | null;
  /** PDF già arrivato al server (prima o durante un invio interrotto). */
  fileId: string | null;
}

/** Referto in attesa, per mostrarlo nella scheda del paziente. */
export interface OutboxItem {
  id: string;
  patientId: string;
  createdAt: string;
  title: string;
  examDate: string;
  attachments: number;
  /** Ultimo errore del server (dati rifiutati): il referto resta in coda finché non lo si elimina. */
  error: string | null;
}

/** Mette in coda un referto (con PDF e immagini, letti dai file scelti e salvati nel database cifrato). */
export async function enqueueReport(
  patientId: string,
  report: { values: DraftValues; fields: ReportField[]; parser: OutboxPayload['parser']; fileId: string | null },
  attachments: { pdf: OutboxAttachment | null; images: OutboxAttachment[] },
): Promise<void> {
  const files = [
    ...(attachments.pdf && !report.fileId ? [{ kind: 'pdf', ...attachments.pdf }] : []),
    ...attachments.images.map((i) => ({ kind: 'image', ...i })),
  ];
  // I file si leggono prima della transazione: se uno non si legge, non resta un referto a metà.
  const read = await Promise.all(files.map(async (f) => ({ ...f, data: new Uint8Array(await new File(f.uri).arrayBuffer()) })));
  const id = Crypto.randomUUID();
  const payload: OutboxPayload = { values: report.values, fields: report.fields, parser: report.parser, fileId: report.fileId };
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('INSERT INTO outbox (id, patientId, createdAt, json) VALUES (?, ?, ?, ?)', id, patientId, new Date().toISOString(), JSON.stringify(payload));
    logger.info(`Referto ${id} salvato sul telefono, in coda`, { files: read.map((f) => ({ kind: f.kind, mimeType: f.mimeType, bytes: f.data.byteLength })), fileId: !!report.fileId });
    for (const f of read) {
      await db.runAsync('INSERT INTO outbox_files (outboxId, kind, name, mimeType, data) VALUES (?, ?, ?, ?, ?)', id, f.kind, f.name, f.mimeType, f.data);
    }
  });
}

export async function listOutbox(patientId?: string): Promise<OutboxItem[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: string; patientId: string; createdAt: string; json: string; error: string | null; files: number }>(
    `SELECT o.id, o.patientId, o.createdAt, o.json, o.error,
       (SELECT count(*) FROM outbox_files f WHERE f.outboxId = o.id) AS files
     FROM outbox o ${patientId ? 'WHERE o.patientId = ?' : ''} ORDER BY o.createdAt`,
    ...(patientId ? [patientId] : []),
  );
  return rows.map((r) => {
    const p = JSON.parse(r.json) as OutboxPayload;
    return {
      id: r.id,
      patientId: r.patientId,
      createdAt: r.createdAt,
      title: p.values.title,
      examDate: p.values.examDate,
      attachments: r.files + (p.fileId ? 1 : 0),
      error: r.error,
    };
  });
}

export async function countOutbox(): Promise<number> {
  const db = await getDb();
  return (await db.getFirstAsync<{ n: number }>('SELECT count(*) AS n FROM outbox'))?.n ?? 0;
}

export async function deleteOutbox(id: string): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM outbox_files WHERE outboxId = ?', id);
    await db.runAsync('DELETE FROM outbox WHERE id = ?', id);
  });
}

/** Un allegato dal database a un file temporaneo (fetch carica i file indicandone il percorso). */
async function withTempFile<T>(data: Uint8Array, mimeType: string, run: (uri: string) => Promise<T>): Promise<T> {
  const file = writeTempDocument(data, mimeType === 'application/pdf' ? 'pdf' : mimeType === 'image/png' ? 'png' : 'jpg');
  try {
    return await run(file.uri);
  } finally {
    deleteTempDocument(file);
  }
}

/**
 * Invia i referti in coda, dal più vecchio. Senza connessione si ferma (riproverà); un referto rifiutato
 * dal server (dati non validi, permesso tolto…) resta in coda con l'errore, e si passa al successivo.
 * Restituisce quanti referti sono stati inviati.
 */
export async function flushOutbox(server: string, token: string): Promise<number> {
  const send: Send = (method, path, payload = {}) => apiRequest(server, path, { method, token, ...payload });
  const db = await getDb();
  let sent = 0;
  for (const item of await listOutbox()) {
    const row = await db.getFirstAsync<{ json: string }>('SELECT json FROM outbox WHERE id = ?', item.id);
    if (!row) continue;
    const payload = JSON.parse(row.json) as OutboxPayload;
    logger.info(`Invio del referto in coda ${item.id}`);
    try {
      const files = await db.getAllAsync<{ id: number; kind: string; name: string; mimeType: string; data: Uint8Array; sentId: string | null }>(
        'SELECT id, kind, name, mimeType, data, sentId FROM outbox_files WHERE outboxId = ? ORDER BY id',
        item.id,
      );
      for (const f of files) {
        if (f.sentId) continue;
        logger.debug(`Referto ${item.id}: invio allegato ${f.kind}`, { mimeType: f.mimeType, bytes: f.data.byteLength });
        let sentId: string;
        if (f.kind === 'pdf') {
          const res = await withTempFile(f.data, f.mimeType, (uri) =>
            uploadDocument(send, item.patientId, { uri, name: f.name, mimeType: f.mimeType === 'image/jpeg' ? 'image/jpeg' : 'application/pdf' }),
          );
          if (res.draft === null) throw new ApiError(409, 'PDF_DUPLICATE', 'Il PDF è già allegato a un altro referto del paziente.');
          sentId = res.draft.file!.id;
          payload.fileId = sentId;
          await db.runAsync('UPDATE outbox SET json = ? WHERE id = ?', JSON.stringify(payload), item.id);
        } else {
          sentId = await withTempFile(f.data, f.mimeType, (uri) =>
            uploadImage(send, item.patientId, { uri, name: f.name, mimeType: f.mimeType }, payload.values.examDate),
          );
        }
        await db.runAsync('UPDATE outbox_files SET sentId = ? WHERE id = ?', sentId, f.id);
      }
      const sentImages = await db.getAllAsync<{ sentId: string }>(
        "SELECT sentId FROM outbox_files WHERE outboxId = ? AND kind = 'image' AND sentId IS NOT NULL ORDER BY id",
        item.id,
      );
      await saveReport(send, item.patientId, payload.values, payload.fields, {
        fileId: payload.fileId,
        parser: payload.fileId ? payload.parser : null,
        studyIds: sentImages.map((r) => r.sentId),
      });
      await deleteOutbox(item.id);
      logger.info(`Referto in coda ${item.id} inviato`);
      sent++;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) throw err;
      // Il motivo si annota sempre, anche quando si riproverà (rete, server in errore): altrimenti il referto
      // resterebbe "in attesa di connessione" senza spiegazione anche con il server raggiungibile.
      const message = err instanceof ApiError ? (err.detail ? `${err.message} (${err.detail})` : err.message) : err instanceof Error ? `Invio non riuscito: ${err.message}` : 'Invio non riuscito';
      await db.runAsync('UPDATE outbox SET error = ? WHERE id = ?', message, item.id);
      logger.error(
        `Referto in coda ${item.id} non inviato: ${message}`,
        err instanceof Error && !(err instanceof ApiError) ? { error: err.name, stack: err.stack?.split('\n').slice(0, 5) } : null,
      );
      if (err instanceof ApiError && (err.offline || err.status >= 500)) throw err;
    }
  }
  return sent;
}
