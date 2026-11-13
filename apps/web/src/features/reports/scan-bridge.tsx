'use client';

import type { ReportDraftDTO, ScanReadDTO } from '@alby/shared';
import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ScanTarget } from './scan-fields';

/**
 * Collegamento tra il form del referto e ciò che gli sta accanto:
 *  - il visualizzatore della scansione: i bottoni dei campi avviano una "selezione" (il documento si
 *    oscura finché non si disegna la zona o si annulla), il testo letto torna al form;
 *  - il modal "Inserisci referto": la proposta letta dal PDF appena caricato arriva al form già aperto.
 * Senza questo contesto il form funziona come prima (nessun bottone OCR).
 */
export interface FormInbox {
  scan: (result: ScanReadDTO, target: ScanTarget) => void;
  draft: (draft: ReportDraftDTO) => void;
}

interface ScanBridge {
  /** La scansione è visibile accanto al form: compaiono i bottoni per leggerne le zone. */
  scanReady: boolean;
  setScanReady: (ready: boolean) => void;
  /** Campo (o tabella dei valori) che aspetta la zona da leggere; `null` se non si sta selezionando. */
  selection: ScanTarget | null;
  startSelection: (target: ScanTarget) => void;
  cancelSelection: () => void;
  /** Il form registra qui le funzioni che ricevono i dati. */
  setInbox: (inbox: FormInbox | null) => void;
  deliverScan: FormInbox['scan'];
  deliverDraft: FormInbox['draft'];
}

const Context = createContext<ScanBridge | null>(null);

export function ScanBridgeProvider({ children }: { children: ReactNode }) {
  const [scanReady, setScanReady] = useState(false);
  const [selection, setSelection] = useState<ScanTarget | null>(null);
  const inbox = useRef<FormInbox | null>(null);
  const value = useMemo<ScanBridge>(
    () => ({
      scanReady,
      setScanReady,
      selection,
      startSelection: setSelection,
      cancelSelection: () => setSelection(null),
      setInbox: (i) => (inbox.current = i),
      deliverScan: (result, target) => inbox.current?.scan(result, target),
      deliverDraft: (draft) => inbox.current?.draft(draft),
    }),
    [scanReady, selection],
  );
  return <Context value={value}>{children}</Context>;
}

/** `null` fuori dalle pagine che affiancano un documento al form. */
export const useScanBridge = () => useContext(Context);
