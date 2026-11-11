'use client';

import type { DiscFile } from '@alby/dicom';
import { DICOM_BATCH_BYTES, MAX_DICOM_BYTES, type DicomUploadResultDTO } from '@alby/shared';
import { useRouter } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';
import { uploadDicomBatchAction } from '@/server/actions/imaging';

/** File del disco letto dal browser (vedi `use-disc-reader`). */
type BrowserDiscFile = DiscFile & { file?: File };

export type UploadState =
  | { status: 'idle' }
  | { status: 'uploading'; sentBytes: number; totalBytes: number; sentFiles: number; totalFiles: number }
  | { status: 'done'; result: DicomUploadResultDTO; cancelled: boolean }
  | { status: 'error'; message: string; result: DicomUploadResultDTO };

/** Gruppi di file di circa DICOM_BATCH_BYTES (un file grande viaggia da solo). */
function batches(files: BrowserDiscFile[]): BrowserDiscFile[][] {
  const out: BrowserDiscFile[][] = [];
  let current: BrowserDiscFile[] = [];
  let size = 0;
  for (const f of files) {
    if (current.length && size + f.size > DICOM_BATCH_BYTES) {
      out.push(current);
      current = [];
      size = 0;
    }
    current.push(f);
    size += f.size;
  }
  if (current.length) out.push(current);
  return out;
}

/**
 * Invia le immagini scelte al server, un gruppo alla volta (un CD può pesare centinaia di MB).
 * Il server rilegge e controlla ogni file; le immagini già presenti non vengono duplicate,
 * quindi un caricamento interrotto si può semplicemente ripetere.
 */
export function useDicomUpload(patientId: string) {
  const router = useRouter();
  const [state, setState] = useState<UploadState>({ status: 'idle' });
  const cancelled = useRef(false);

  const upload = useCallback(
    async (files: BrowserDiscFile[]) => {
      cancelled.current = false;
      const result: DicomUploadResultDTO = { added: 0, duplicates: 0, rejected: [] };
      const tooBig = files.filter((f) => f.size > MAX_DICOM_BYTES);
      result.rejected.push(...tooBig.map((f) => ({ name: f.path, reason: `supera i ${MAX_DICOM_BYTES / 1024 / 1024} MB` })));
      const todo = files.filter((f) => f.size <= MAX_DICOM_BYTES);
      const totalBytes = todo.reduce((n, f) => n + f.size, 0);
      let sentBytes = 0;
      let sentFiles = 0;
      setState({ status: 'uploading', sentBytes, totalBytes, sentFiles, totalFiles: todo.length });

      try {
        for (const group of batches(todo)) {
          if (cancelled.current) break;
          const data = new FormData();
          for (const f of group) {
            // Dal disco si legge solo adesso, un gruppo alla volta.
            const blob = f.file ?? new Blob([(await f.read(0, f.size)).slice()]);
            data.append('files', blob, f.path);
          }
          const res = await uploadDicomBatchAction(patientId, data);
          if (!res.ok) {
            setState({ status: 'error', message: res.message, result });
            router.refresh();
            return;
          }
          result.added += res.data.added;
          result.duplicates += res.data.duplicates;
          result.rejected.push(...res.data.rejected);
          sentBytes += group.reduce((n, f) => n + f.size, 0);
          sentFiles += group.length;
          setState({ status: 'uploading', sentBytes, totalBytes, sentFiles, totalFiles: todo.length });
        }
        setState({ status: 'done', result, cancelled: cancelled.current });
      } catch (err) {
        console.error('[immagini] caricamento non riuscito', err);
        setState({ status: 'error', message: 'Caricamento interrotto (connessione o disco non disponibile). Puoi riprovare: le immagini già salvate non verranno duplicate.', result });
      }
      // Aggiorna la scheda del paziente con gli studi appena salvati.
      router.refresh();
    },
    [patientId, router],
  );

  const cancel = useCallback(() => {
    cancelled.current = true;
  }, []);
  const reset = useCallback(() => setState({ status: 'idle' }), []);

  return { state, upload, cancel, reset };
}
