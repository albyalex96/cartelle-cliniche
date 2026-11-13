'use client';

import type { ReportDraftDTO, ScanReadDTO, ScanRegion } from '@alby/shared';
import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ScanTarget } from './scan-fields';

/**
 * Collegamento tra il form del referto e il documento che gli sta accanto:
 *  - un bottone del form avvia una "selezione": il documento si oscura finché non si disegna la zona
 *    (o si annulla con Esc / "Annulla");
 *  - la zona viene letta con l'OCR (il testo torna al form) o ritagliata come immagine
 *    (la riceve la sezione Immagini, che la salva);
 *  - il modal "Inserisci referto" consegna al form già aperto la proposta letta dal PDF appena caricato.
 * Senza questo contesto il form funziona come prima (nessun bottone per il documento).
 */
export interface FormInbox {
  scan: (result: ScanReadDTO, target: ScanTarget) => void;
  draft: (draft: ReportDraftDTO) => void;
}

/** Riceve una zona da ritagliare come immagine; la promessa termina a immagine salvata. */
export type CropHandler = (fileId: string, page: number, region: ScanRegion) => Promise<void>;

interface ScanBridge {
  /** C'è un PDF accanto al form: si può ritagliarne una zona come immagine. */
  pdfReady: boolean;
  setPdfReady: (ready: boolean) => void;
  /** Il PDF è una scansione e l'OCR è attivo: compaiono i bottoni per leggerne le zone. */
  scanReady: boolean;
  setScanReady: (ready: boolean) => void;
  /** Cosa aspetta la zona da selezionare; `null` se non si sta selezionando. */
  selection: ScanTarget | null;
  startSelection: (target: ScanTarget) => void;
  cancelSelection: () => void;
  /** Il form registra qui le funzioni che ricevono i dati. */
  setInbox: (inbox: FormInbox | null) => void;
  deliverScan: FormInbox['scan'];
  deliverDraft: FormInbox['draft'];
  /** La sezione Immagini registra qui chi salva i ritagli. */
  setCropHandler: (handler: CropHandler | null) => void;
  crop: CropHandler;
}

const Context = createContext<ScanBridge | null>(null);

export function ScanBridgeProvider({ children }: { children: ReactNode }) {
  const [pdfReady, setPdfReady] = useState(false);
  const [scanReady, setScanReady] = useState(false);
  const [selection, setSelection] = useState<ScanTarget | null>(null);
  const inbox = useRef<FormInbox | null>(null);
  const cropHandler = useRef<CropHandler | null>(null);
  const value = useMemo<ScanBridge>(
    () => ({
      pdfReady,
      setPdfReady,
      scanReady,
      setScanReady,
      selection,
      startSelection: setSelection,
      cancelSelection: () => setSelection(null),
      setInbox: (i) => (inbox.current = i),
      deliverScan: (result, target) => inbox.current?.scan(result, target),
      deliverDraft: (draft) => inbox.current?.draft(draft),
      setCropHandler: (h) => (cropHandler.current = h),
      crop: async (fileId, page, region) => cropHandler.current?.(fileId, page, region),
    }),
    [pdfReady, scanReady, selection],
  );
  return <Context value={value}>{children}</Context>;
}

/** `null` fuori dalle pagine che affiancano un documento al form. */
export const useScanBridge = () => useContext(Context);
