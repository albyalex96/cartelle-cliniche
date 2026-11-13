'use client';

import type { ReportDraftDTO, StoredFileDTO } from '@alby/shared';
import { useEffect } from 'react';
import { PdfPanel } from './pdf-panel';
import { useScanBridge } from './scan-bridge';
import { ScanViewer } from './scan-viewer';

/**
 * Il PDF accanto al form. Di solito il visualizzatore del browser; le pagine come immagini (su cui si
 * seleziona una zona) se il PDF è una scansione con l'OCR attivo, o mentre se ne ritaglia un'immagine.
 */
export function DocumentPane({
  file,
  doc,
  className,
}: {
  file: StoredFileDTO;
  /** Pagine e scansione: dalla proposta del PDF appena caricato o, in modifica, da `getReportDocument`. */
  doc: Pick<ReportDraftDTO, 'scan' | 'pages'>;
  className?: string;
}) {
  const bridge = useScanBridge();
  const ocr = !!doc.scan;
  const pages = doc.scan?.pages ?? doc.pages;

  // Il form mostra i bottoni del documento (ritaglio sempre, OCR solo per le scansioni).
  const setPdfReady = bridge?.setPdfReady;
  const setScanReady = bridge?.setScanReady;
  useEffect(() => {
    setPdfReady?.(!!pages);
    setScanReady?.(ocr);
    return () => {
      setPdfReady?.(false);
      setScanReady?.(false);
    };
  }, [setPdfReady, setScanReady, ocr, pages]);

  const asImages = pages && (ocr || bridge?.selection?.kind === 'crop');
  return asImages ? <ScanViewer file={file} pages={pages} ocr={ocr} className={className} /> : <PdfPanel file={file} className={className} />;
}
