'use client';

import {
  ChevronLeft,
  ChevronRight,
  Columns2,
  Columns3,
  Contrast,
  Eraser,
  FlipHorizontal2,
  Grid2x2,
  Hand,
  Link2,
  PanelRight,
  RotateCcw,
  RotateCcwSquare,
  RotateCwSquare,
  Ruler,
  Square,
  SunMedium,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { ImageStage } from './image-stage';
import type { ViewerSeries } from './viewer-series';
import { DEFAULT_VIEW, rotateBy, ZOOM_MAX, zoomBy, type Measure, type Tool, type View } from './viewer-tools';

/** Un'immagine nella sequenza unica dello studio. */
export interface ViewerImage {
  id: string;
  seriesIndex: number;
  /** Posizione nella sua serie, da 1. */
  position: number;
  label: string;
}

const MAX_PANELS = 4;
const LAYOUTS: { count: number; label: string; icon: LucideIcon; grid: string }[] = [
  { count: 1, label: 'Una immagine', icon: Square, grid: '' },
  { count: 2, label: 'Due immagini affiancate', icon: Columns2, grid: 'grid-rows-2 sm:grid-cols-2 sm:grid-rows-1' },
  { count: 3, label: 'Tre immagini affiancate', icon: Columns3, grid: 'grid-rows-3 sm:grid-cols-3 sm:grid-rows-1' },
  { count: 4, label: 'Quattro immagini', icon: Grid2x2, grid: 'grid-cols-2 grid-rows-2' },
];

const HINTS: Record<Tool, string> = {
  pan: 'Rotellina: scorre le immagini · Ctrl + rotellina: zoom · trascina per spostare · doppio clic: dimensione iniziale.',
  measure:
    'Trascina sull’immagine per misurare una distanza; clic su un valore per eliminarlo. In pixel se il file non dichiara la scala; «≈» = scala del rivelatore (radiografie), leggermente sovrastimata. Le misure sono indicative e non vengono salvate.',
  adjust: 'Trascina in orizzontale per il contrasto, in verticale per la luminosità.',
};

function ToolbarButton({
  label,
  icon: Icon,
  pressed,
  children,
  ...props
}: { label: string; icon: LucideIcon; pressed?: boolean; children?: ReactNode } & Omit<React.ComponentProps<typeof Button>, 'children'>) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant={pressed ? 'default' : 'ghost'} size={children ? 'sm' : 'icon-sm'} aria-label={label} aria-pressed={pressed} {...props}>
          <Icon />
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

const Divider = () => <span className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden />;

/**
 * Consultazione delle immagini di uno studio a tutto schermo: fino a quattro immagini affiancate
 * (anche di serie diverse), zoom, luminosità e contrasto, negativo, misura delle distanze,
 * con il testo del referto collegato accanto (si può nascondere).
 * Viene montato all'apertura: alla chiusura riquadri, zoom e misure si azzerano.
 */
export function StudyViewerDialog({
  series,
  images,
  firstOf,
  start,
  report,
  onClose,
}: {
  series: ViewerSeries[];
  images: ViewerImage[];
  /** Indice, nella sequenza, della prima immagine di ogni serie. */
  firstOf: number[];
  /** Immagine da cui partire. */
  start: number;
  report?: { title: string; body: string } | null;
  onClose: () => void;
}) {
  const last = images.length - 1;
  // I riquadri in più partono dalle serie successive (o, con una sola serie, dalle immagini successive).
  const [panels, setPanels] = useState<{ index: number; view: View }[]>(() => {
    const s0 = images[start]!.seriesIndex;
    return Array.from({ length: MAX_PANELS }, (_, k) => ({
      index: k === 0 ? start : series.length > 1 ? firstOf[(s0 + k) % series.length]! : Math.min(last, start + k),
      view: DEFAULT_VIEW,
    }));
  });
  const [count, setCount] = useState(1);
  const [activeRaw, setActive] = useState(0);
  const active = Math.min(activeRaw, count - 1);
  const [tool, setTool] = useState<Tool>('pan');
  const [sync, setSync] = useState(false);
  const [showText, setShowText] = useState(true);
  // Misure per immagine: restano mentre si scorre e valgono in tutti i riquadri.
  const [measures, setMeasures] = useState<Record<string, Measure[]>>({});

  const visible = panels.slice(0, count);
  const current = images[visible[active]!.index]!;
  const currentSeries = series[current.seriesIndex]!;
  const activeView = visible[active]!.view;

  const patch = (panel: number, change: (p: { index: number; view: View }) => { index: number; view: View }) =>
    setPanels((all) => all.map((p, i) => (i === panel ? change(p) : p)));
  const step = (panel: number, by: number) =>
    setPanels((all) => all.map((p, i) => ((sync ? i < count : i === panel) ? { ...p, index: Math.min(last, Math.max(0, p.index + by)) } : p)));
  const setView = (panel: number, view: View) => patch(panel, (p) => ({ ...p, view }));
  const hasMeasures = visible.some((p) => measures[images[p.index]!.id]?.length);
  const changed = visible.some((p) => p.view !== DEFAULT_VIEW);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="flex h-[calc(100dvh-2rem)] max-w-[calc(100%-2rem)] flex-col gap-2 sm:max-w-[calc(100%-2rem)]"
        onKeyDown={(e) => {
          // Dentro i menu di scelta le frecce servono al menu.
          if ((e.target as HTMLElement).closest('[role="listbox"], [role="combobox"]')) return;
          if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') step(active, -1);
          if (e.key === 'ArrowRight' || e.key === 'ArrowDown') step(active, 1);
        }}
      >
        <div className="pr-10">
          <DialogTitle className="truncate">{currentSeries.name}</DialogTitle>
          <DialogDescription>
            Immagine {current.position} di {currentSeries.imageIds.length}
            {series.length > 1 && ` · serie ${current.seriesIndex + 1} di ${series.length}`}. Anteprima non adatta alla diagnosi.
          </DialogDescription>
        </div>

        <div className="flex flex-wrap items-center gap-0.5" role="toolbar" aria-label="Strumenti">
          <ToolbarButton label="Sposta e scorri" icon={Hand} pressed={tool === 'pan'} onClick={() => setTool('pan')} />
          <ToolbarButton label="Misura una distanza" icon={Ruler} pressed={tool === 'measure'} onClick={() => setTool('measure')}>
            <span className="max-sm:hidden">Misura</span>
          </ToolbarButton>
          <ToolbarButton label="Luminosità e contrasto" icon={SunMedium} pressed={tool === 'adjust'} onClick={() => setTool('adjust')} />
          <Divider />
          <ToolbarButton label="Riduci" icon={ZoomOut} disabled={activeView.zoom <= 1} onClick={() => setView(active, zoomBy(activeView, 1 / 1.5))} />
          <ToolbarButton label="Ingrandisci" icon={ZoomIn} disabled={activeView.zoom >= ZOOM_MAX} onClick={() => setView(active, zoomBy(activeView, 1.5))} />
          <ToolbarButton label="Ruota a sinistra" icon={RotateCcwSquare} onClick={() => setView(active, rotateBy(activeView, -1))} />
          <ToolbarButton label="Ruota a destra" icon={RotateCwSquare} onClick={() => setView(active, rotateBy(activeView, 1))} />
          <ToolbarButton label="Specchia" icon={FlipHorizontal2} pressed={activeView.flip} onClick={() => setView(active, { ...activeView, flip: !activeView.flip })} />
          <ToolbarButton label="Negativo" icon={Contrast} pressed={activeView.invert} onClick={() => setView(active, { ...activeView, invert: !activeView.invert })} />
          <ToolbarButton
            label="Ripristina la vista (zoom, rotazione, luminosità e contrasto)"
            icon={RotateCcw}
            disabled={!changed}
            onClick={() => setPanels((all) => all.map((p, i) => (i < count ? { ...p, view: DEFAULT_VIEW } : p)))}
          />
          <ToolbarButton
            label="Cancella le misure"
            icon={Eraser}
            disabled={!hasMeasures}
            onClick={() => setMeasures((all) => Object.fromEntries(Object.entries(all).filter(([id]) => !visible.some((p) => images[p.index]!.id === id))))}
          />
          <Divider />
          {images.length > 1 &&
            LAYOUTS.map((l) => <ToolbarButton key={l.count} label={l.label} icon={l.icon} pressed={count === l.count} onClick={() => setCount(l.count)} />)}
          {count > 1 && (
            <ToolbarButton label="Scorri tutti i riquadri insieme" icon={Link2} pressed={sync} onClick={() => setSync((v) => !v)}>
              <span className="max-sm:hidden">Scorri insieme</span>
            </ToolbarButton>
          )}
          {report && (
            <>
              <Divider />
              <ToolbarButton label={showText ? 'Nascondi il testo del referto' : 'Mostra il testo del referto'} icon={PanelRight} pressed={showText} onClick={() => setShowText((v) => !v)}>
                <span className="max-sm:hidden">Testo</span>
              </ToolbarButton>
            </>
          )}
        </div>

        <div className={cn('grid min-h-0 flex-1 gap-3', report && showText && 'grid-rows-[minmax(0,3fr)_minmax(0,2fr)] lg:grid-cols-[minmax(0,1fr)_24rem] lg:grid-rows-1')}>
          <div className={cn('grid min-h-0 gap-2', LAYOUTS.find((l) => l.count === count)!.grid)}>
            {visible.map((panel, i) => {
              const image = images[panel.index]!;
              const s = series[image.seriesIndex]!;
              return (
                <section
                  key={i}
                  aria-label={`Riquadro ${i + 1}: ${image.label}`}
                  onPointerDownCapture={() => setActive(i)}
                  onFocusCapture={() => setActive(i)}
                  className={cn('flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border', count > 1 && i === active && 'border-primary ring-2 ring-primary/40')}
                >
                  <div className="flex items-center gap-1 bg-muted/50 p-1">
                    {series.length > 1 ? (
                      <Select value={String(image.seriesIndex)} onValueChange={(v) => patch(i, (p) => ({ ...p, index: firstOf[Number(v)]! }))}>
                        <SelectTrigger size="sm" className="min-w-0 flex-1" aria-label="Serie">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {series.map((x, si) => (
                            <SelectItem key={x.id} value={String(si)}>
                              {x.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="min-w-0 flex-1 truncate px-1 text-sm text-muted-foreground">{s.name}</span>
                    )}
                    <span className="shrink-0 px-1 text-xs tabular-nums text-muted-foreground">
                      {image.position} / {s.imageIds.length}
                    </span>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label="Immagine precedente" onClick={() => step(i, -1)} disabled={panel.index <= 0}>
                      <ChevronLeft />
                    </Button>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label="Immagine successiva" onClick={() => step(i, 1)} disabled={panel.index >= last}>
                      <ChevronRight />
                    </Button>
                  </div>
                  <ImageStage
                    id={image.id}
                    alt={image.label}
                    tool={tool}
                    view={panel.view}
                    onViewChange={(view) => setView(i, view)}
                    measures={measures[image.id] ?? []}
                    onMeasuresChange={(next) => setMeasures((all) => ({ ...all, [image.id]: next }))}
                    onStep={(by) => step(i, by)}
                    className="min-h-0 flex-1"
                  />
                </section>
              );
            })}
          </div>
          {report && showText && (
            <aside className="flex min-h-0 flex-col gap-2 rounded-lg border bg-card p-3">
              <h3 className="text-sm font-medium">{report.title}</h3>
              <p className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{report.body}</p>
            </aside>
          )}
        </div>

        <p className="text-xs text-muted-foreground">{HINTS[tool]}</p>
      </DialogContent>
    </Dialog>
  );
}
