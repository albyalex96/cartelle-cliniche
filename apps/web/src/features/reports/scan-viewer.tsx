'use client';

import type { ReportDraftDTO, ScanRegion, StoredFileDTO } from '@alby/shared';
import { ChevronLeft, ChevronRight, Download, ExternalLink, ScanText, X } from 'lucide-react';
import { useEffect, useRef, useState, useTransition, type PointerEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { readScanAreaAction } from '@/server/actions/reports';
import { useScanBridge } from './scan-bridge';
import { SCAN_FIELDS, targetLabel, type ScanTarget } from './scan-fields';

type Point = { x: number; y: number };

/**
 * PDF scansionato mostrato pagina per pagina. Con un bottone del form si avvia la selezione:
 * il documento si oscura, si trascina un riquadro sulla zona da leggere (che torna luminosa) e il
 * testo riconosciuto (OCR sul server) finisce in quel campo. Esc o "Annulla" interrompono la selezione.
 */
export function ScanViewer({ file, scan, className }: { file: StoredFileDTO; scan: NonNullable<ReportDraftDTO['scan']>; className?: string }) {
  const bridge = useScanBridge();
  const src = `/api/files/${file.id}`;
  const pageCount = scan.pages.length;
  const [page, setPage] = useState(1);
  const [start, setStart] = useState<Point | null>(null);
  const [region, setRegion] = useState<ScanRegion | null>(null);
  const [pending, startTransition] = useTransition();
  const surface = useRef<HTMLDivElement>(null);

  const selection = bridge?.selection ?? null;
  const selecting = !!selection && !pending;

  // Con il visualizzatore presente, il form mostra i bottoni per leggere le zone.
  const setScanReady = bridge?.setScanReady;
  useEffect(() => {
    setScanReady?.(true);
    return () => setScanReady?.(false);
  }, [setScanReady]);

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

  const size = scan.pages[page - 1]!;

  function read(target: ScanTarget, area?: ScanRegion) {
    const mode = target.kind === 'table' ? 'table' : target.kind === 'page' ? 'page' : SCAN_FIELDS[target.field].mode;
    startTransition(async () => {
      const result = await readScanAreaAction(file.id, { page, mode, region: area });
      setRegion(null);
      bridge?.cancelSelection();
      if (!result.ok) toast.error(result.message);
      else bridge?.deliverScan(result.data, target);
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
    read(selection, area);
  }

  const goTo = (n: number) => {
    setRegion(null);
    setPage(Math.min(pageCount, Math.max(1, n)));
  };

  // Oscuramento: tutto il documento finché non si disegna; poi tutto tranne il riquadro (che resta luminoso).
  const dimmed = !!selection || pending;

  return (
    <aside className={cn('grid gap-2 lg:sticky lg:top-4 lg:self-start', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm text-muted-foreground" title={file.fileName}>
          {file.fileName}
        </p>
        <div className="flex shrink-0 gap-1">
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

      <div className="relative">
        {/* Avviso della selezione in corso: resta visibile anche scorrendo il documento. */}
        {selection && (
          <div
            role="status"
            className="absolute inset-x-3 top-3 z-20 flex items-center gap-3 rounded-lg border bg-popover p-3 text-sm text-popover-foreground shadow-lg"
          >
            {pending ? <Spinner /> : <ScanText className="size-4 shrink-0 text-primary" />}
            <p className="min-w-0 flex-1">
              {pending ? (
                'Lettura in corso…'
              ) : (
                <>
                  Seleziona l’area da cui estrarre <strong>{targetLabel(selection)}</strong>
                  {selection.kind === 'table' && ' (righe con nome, valore, unità e intervallo)'}.
                  <span className="hidden text-muted-foreground sm:inline"> Esc per annullare.</span>
                </>
              )}
            </p>
            <Button type="button" variant="outline" size="sm" disabled={pending} onClick={cancel}>
              <X />
              Annulla
            </Button>
          </div>
        )}

        <div className="h-[calc(100svh-var(--viewer-offset,7rem)-2.75rem)] min-h-80 overflow-auto rounded-xl border bg-muted">
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
