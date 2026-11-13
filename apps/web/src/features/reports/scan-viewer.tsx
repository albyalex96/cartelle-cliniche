'use client';

import type { ScanRegion, StoredFileDTO } from '@alby/shared';
import { Check, ChevronLeft, ChevronRight, Crop, Download, ExternalLink, RotateCcw, ScanText, SkipForward, X } from 'lucide-react';
import { useEffect, useRef, useState, useTransition, type PointerEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { readScanAreaAction } from '@/server/actions/reports';
import { useScanBridge } from './scan-bridge';
import { SCAN_FIELDS, sameTarget, targetLabel, type ScanTarget } from './scan-fields';

type Point = { x: number; y: number };

/**
 * PDF mostrato pagina per pagina, come immagini. Con un bottone del form si avvia la selezione:
 * il documento si oscura, si trascina un riquadro sulla zona (che torna luminosa) e la zona viene
 * letta con l'OCR (il testo finisce nel campo scelto) oppure ritagliata come immagine.
 * Esc o "Annulla" interrompono la selezione.
 */
export function ScanViewer({
  file,
  pages,
  ocr,
  className,
}: {
  file: StoredFileDTO;
  pages: { width: number; height: number }[];
  /** OCR disponibile (scansione con OCR attivo): mostra "Leggi tutta la pagina". */
  ocr: boolean;
  className?: string;
}) {
  const bridge = useScanBridge();
  const src = `/api/files/${file.id}`;
  const pageCount = pages.length;
  const [page, setPage] = useState(1);
  const [start, setStart] = useState<Point | null>(null);
  const [region, setRegion] = useState<ScanRegion | null>(null);
  const [pending, startTransition] = useTransition();
  const surface = useRef<HTMLDivElement>(null);

  const selection = bridge?.selection ?? null;
  const selecting = !!selection && !pending;
  // Compilazione sequenziale: posizione del campo da selezionare e se si sta rileggendo l'ultimo compilato.
  const sequence = bridge?.sequence ?? null;
  const step = sequence && selection ? sequence.steps.findIndex((t) => sameTarget(t, selection)) + 1 : 0;
  const repeating = !!sequence?.last && !!selection && sameTarget(selection, sequence.last);

  function cancel() {
    setStart(null);
    setRegion(null);
    bridge?.cancelSelection();
  }

  // Esc annulla la selezione (nel modal, il modal resta aperto: vedi NewReportDialog).
  useEffect(() => {
    if (!selection || pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, pending]);

  const size = pages[page - 1]!;

  // Ritagli fatti dall'ultima volta che si è entrati nella modalità ritaglio.
  const [cropped, setCropped] = useState(0);
  useEffect(() => {
    if (selection?.kind !== 'crop') setCropped(0);
  }, [selection]);

  /**
   * Zona da ritagliare come immagine: la salva la sezione Immagini del form. Poi si resta nella
   * modalità ritaglio, pronti per la prossima immagine (si esce con "Fine" o Esc).
   */
  function crop(area: ScanRegion) {
    startTransition(async () => {
      const saved = await bridge?.crop(file.id, page, area);
      setRegion(null);
      if (saved) setCropped((n) => n + 1);
    });
  }

  function read(target: Exclude<ScanTarget, { kind: 'crop' }>, area?: ScanRegion) {
    const mode = target.kind === 'table' ? 'table' : target.kind === 'page' ? 'page' : SCAN_FIELDS[target.field].mode;
    startTransition(async () => {
      const result = await readScanAreaAction(file.id, { page, mode, region: area });
      setRegion(null);
      if (!result.ok) toast.error(result.message);
      // Fuori sequenza la selezione finisce; in sequenza si passa al campo successivo (o si riprova).
      bridge?.finishRead(target, result.ok && bridge.deliverScan(result.data, target));
    });
  }

  // Coordinate del puntatore in frazioni della pagina (0–1).
  const at = (e: PointerEvent): Point => {
    const box = surface.current!.getBoundingClientRect();
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    return { x: clamp((e.clientX - box.left) / box.width), y: clamp((e.clientY - box.top) / box.height) };
  };
  const between = (a: Point, b: Point): ScanRegion => ({
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  });

  function onPointerDown(e: PointerEvent) {
    if (!selecting || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = at(e);
    setStart(p);
    setRegion({ ...p, width: 0, height: 0 });
  }
  function onPointerMove(e: PointerEvent) {
    if (start) setRegion(between(start, at(e)));
  }
  function onPointerUp(e: PointerEvent) {
    if (!start || !selection) return;
    const area = between(start, at(e));
    setStart(null);
    // Un clic senza trascinare non basta: si resta in selezione.
    if (area.width < 0.01 || area.height < 0.01) {
      setRegion(null);
      return;
    }
    setRegion(area);
    if (selection.kind === 'crop') crop(area);
    else read(selection, area);
  }

  const goTo = (n: number) => {
    setRegion(null);
    setPage(Math.min(pageCount, Math.max(1, n)));
  };

  // Rotellina: scorre la pagina finché si può; arrivati al bordo, uno "scatto" in più passa alla
  // pagina successiva (dall'inizio) o alla precedente (dalla fine). Ascoltata "a mano" per poter
  // fermare lo scorrimento della pagina dietro.
  const scroller = useRef<HTMLDivElement>(null);
  const live = useRef({ page, pageCount, busy: pending || !!start });
  useEffect(() => {
    live.current = { page, pageCount, busy: pending || !!start };
  });
  useEffect(() => {
    const el = scroller.current;
    if (!el || pageCount < 2) return;
    let acc = 0;
    let lastTurn = 0;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
      const { page, pageCount, busy } = live.current;
      const down = e.deltaY > 0;
      const atEdge = down ? el.scrollTop + el.clientHeight >= el.scrollHeight - 1 : el.scrollTop <= 0;
      if (!atEdge) {
        acc = 0;
        return;
      }
      e.preventDefault();
      if (busy || (down ? page >= pageCount : page <= 1)) return;
      // Un passaggio per "scatto" (non uno per ogni piccolo movimento del touchpad), con una breve pausa.
      acc += e.deltaY;
      if (Math.abs(acc) < 60 || e.timeStamp - lastTurn < 350) return;
      acc = 0;
      lastTurn = e.timeStamp;
      setRegion(null);
      setPage(page + (down ? 1 : -1));
      // La nuova pagina si mostra dal lato da cui si arriva.
      requestAnimationFrame(() => (el.scrollTop = down ? 0 : el.scrollHeight));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [pageCount]);

  // Oscuramento: tutto il documento finché non si disegna; poi tutto tranne il riquadro (che resta luminoso).
  const dimmed = !!selection || pending;

  return (
    <aside className={cn('grid gap-2 lg:sticky lg:top-4 lg:self-start', className)}>
      {/* Durante la selezione l'avviso prende il posto dell'intestazione: non copre il documento. */}
      {selection ? (
        <div
          role="status"
          className="flex min-h-8 flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-primary/30 bg-primary/5 py-0.5 pr-0.5 pl-2.5 text-sm"
        >
          {pending ? <Spinner /> : selection.kind === 'crop' ? <Crop className="size-4 shrink-0 text-primary" /> : <ScanText className="size-4 shrink-0 text-primary" />}
          <p className="min-w-48 flex-1">
            {pending ? (
              selection.kind === 'crop' ? 'Salvataggio dell’immagine…' : 'Lettura in corso…'
            ) : selection.kind === 'crop' ? (
              sequence && cropped === 0 ? (
                // Ultimo passo della compilazione sequenziale: le immagini sono facoltative.
                <>
                  Campi compilati. Se vuoi aggiungere immagini, seleziona l’area da <strong>ritagliare come immagine</strong>; altrimenti premi
                  «Fine».
                </>
              ) : (
                <>
                  {cropped > 0 ? 'Immagine salvata. Seleziona un’altra area da ' : 'Seleziona l’area da '}
                  <strong>ritagliare come immagine</strong>.
                  <span className="hidden text-muted-foreground sm:inline"> Esc per {cropped > 0 ? 'finire' : 'annullare'}.</span>
                </>
              )
            ) : (
              <>
                {sequence?.last && !repeating && <>«{targetLabel(sequence.last)}» compilato. </>}
                Seleziona l’area da cui estrarre <strong>{targetLabel(selection)}</strong>
                {selection.kind === 'table' && ' (righe con nome, valore, unità e intervallo)'}
                {sequence && (
                  <span className="text-muted-foreground tabular-nums">
                    {' '}
                    ({step} di {sequence.steps.length})
                  </span>
                )}
                .<span className="hidden text-muted-foreground sm:inline"> Esc per {sequence ? 'finire' : 'annullare'}.</span>
              </>
            )}
          </p>
          {sequence?.last && !repeating && (
            <Button type="button" variant="outline" size="sm" disabled={pending} title={`Seleziona di nuovo l’area per «${targetLabel(sequence.last)}»`} onClick={bridge?.repeat}>
              <RotateCcw />
              Ripeti
            </Button>
          )}
          {sequence && selection.kind !== 'crop' && (
            <Button type="button" variant="ghost" size="sm" disabled={pending} title="Lascia questo campo com’è e passa al successivo" onClick={() => bridge?.skip(selection)}>
              <SkipForward />
              Salta
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={cancel}>
            {cropped > 0 || sequence?.last ? <Check /> : <X />}
            {cropped > 0 || sequence?.last ? 'Fine' : 'Annulla'}
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm text-muted-foreground" title={file.fileName}>
            {file.fileName}
          </p>
          <div className="flex shrink-0 gap-1">
            {ocr && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending || !!selection}
                title="Legge tutta la pagina e prova a compilare da solo i campi vuoti (più lento, più errori)"
                onClick={() => read({ kind: 'page' })}
              >
                <ScanText />
                Leggi tutta la pagina
              </Button>
            )}
            <Button variant="ghost" size="sm" asChild>
              <a href={src} target="_blank" rel="noopener">
                <ExternalLink />
                Apri
              </a>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <a href={`${src}?download=1`} download>
                <Download />
                Scarica
              </a>
            </Button>
          </div>
        </div>
      )}

      <div className="relative">
        <div ref={scroller} className="h-[calc(100svh-var(--viewer-offset,7rem)-2.75rem)] min-h-80 overflow-auto overscroll-contain rounded-xl border bg-muted">
          <div
            ref={surface}
            className={cn('relative w-full touch-none select-none overflow-hidden', selecting ? 'cursor-crosshair' : 'cursor-default')}
            style={{ aspectRatio: `${size.width} / ${size.height}` }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => {
              setStart(null);
              setRegion(null);
            }}
          >
            {/* <img> semplice: immagine privata generata dal server, da non passare per l'ottimizzatore di Next. */}
            <img
              key={page}
              src={`${src}/pagine/${page}`}
              alt={`Pagina ${page} di ${pageCount}`}
              draggable={false}
              className="absolute inset-0 size-full bg-white object-contain"
            />
            {dimmed && !region && (
              <div className="absolute inset-0 grid place-items-center bg-black/55 text-white">{pending && !selection && <Spinner />}</div>
            )}
            {region && (
              <div
                className="absolute border-2 border-primary"
                // L'ombra enorme oscura tutto il resto della pagina: il riquadro resta luminoso.
                style={{
                  left: `${region.x * 100}%`,
                  top: `${region.y * 100}%`,
                  width: `${region.width * 100}%`,
                  height: `${region.height * 100}%`,
                  boxShadow: '0 0 0 9999px rgb(0 0 0 / 0.55)',
                }}
              />
            )}
          </div>
        </div>
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Pagina precedente" disabled={page === 1 || pending} onClick={() => goTo(page - 1)}>
            <ChevronLeft />
          </Button>
          <span className="tabular-nums text-muted-foreground">
            Pagina {page} di {pageCount}
          </span>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Pagina successiva" disabled={page === pageCount || pending} onClick={() => goTo(page + 1)}>
            <ChevronRight />
          </Button>
        </div>
      )}
    </aside>
  );
}
