'use client';

import {
  Contrast,
  Eraser,
  FlipHorizontal2,
  Hand,
  RotateCcw,
  RotateCcwSquare,
  RotateCwSquare,
  Ruler,
  SunMedium,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { ToolbarButton, ToolbarDivider } from '@/components/toolbar-button';
import { DEFAULT_VIEW, rotateBy, ZOOM_MAX, zoomBy, type Tool, type View } from './viewer-tools';

export const TOOL_HINTS: Record<Tool, string> = {
  pan: 'Rotellina: scorre le immagini · Ctrl + rotellina: zoom · trascina per spostare · doppio clic: dimensione iniziale.',
  measure:
    'Trascina sull’immagine per misurare una distanza; clic su un valore per eliminarlo. In pixel se il file non dichiara la scala; «≈» = scala del rivelatore (radiografie), leggermente sovrastimata. Le misure sono indicative e non vengono salvate.',
  adjust: 'Trascina in orizzontale per il contrasto, in verticale per la luminosità.',
};

/**
 * Barra degli strumenti di `ImageStage`: cosa fa il trascinamento, zoom, rotazione, specchio, negativo,
 * ripristino e cancellazione delle misure. `children`: altri bottoni in fondo.
 */
export function ImageTools({
  tool,
  onToolChange,
  view,
  onViewChange,
  changed = view !== DEFAULT_VIEW,
  onReset = () => onViewChange(DEFAULT_VIEW),
  hasMeasures,
  onClearMeasures,
  children,
}: {
  tool: Tool;
  onToolChange: (tool: Tool) => void;
  /** Vista dell'immagine comandata da zoom, rotazione, specchio e negativo. */
  view: View;
  onViewChange: (view: View) => void;
  /** C'è qualcosa da ripristinare (di solito: la vista non è quella iniziale). */
  changed?: boolean;
  onReset?: () => void;
  hasMeasures: boolean;
  onClearMeasures: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-0.5" role="toolbar" aria-label="Strumenti">
      <ToolbarButton label="Sposta e scorri" icon={Hand} pressed={tool === 'pan'} onClick={() => onToolChange('pan')} />
      <ToolbarButton label="Misura una distanza" icon={Ruler} pressed={tool === 'measure'} onClick={() => onToolChange('measure')}>
        <span className="max-sm:hidden">Misura</span>
      </ToolbarButton>
      <ToolbarButton label="Luminosità e contrasto" icon={SunMedium} pressed={tool === 'adjust'} onClick={() => onToolChange('adjust')} />
      <ToolbarDivider />
      <ToolbarButton label="Riduci" icon={ZoomOut} disabled={view.zoom <= 1} onClick={() => onViewChange(zoomBy(view, 1 / 1.5))} />
      <ToolbarButton label="Ingrandisci" icon={ZoomIn} disabled={view.zoom >= ZOOM_MAX} onClick={() => onViewChange(zoomBy(view, 1.5))} />
      <ToolbarButton label="Ruota a sinistra" icon={RotateCcwSquare} onClick={() => onViewChange(rotateBy(view, -1))} />
      <ToolbarButton label="Ruota a destra" icon={RotateCwSquare} onClick={() => onViewChange(rotateBy(view, 1))} />
      <ToolbarButton label="Specchia" icon={FlipHorizontal2} pressed={view.flip} onClick={() => onViewChange({ ...view, flip: !view.flip })} />
      <ToolbarButton label="Negativo" icon={Contrast} pressed={view.invert} onClick={() => onViewChange({ ...view, invert: !view.invert })} />
      <ToolbarButton label="Ripristina la vista (zoom, rotazione, luminosità e contrasto)" icon={RotateCcw} disabled={!changed} onClick={onReset} />
      <ToolbarButton label="Cancella le misure" icon={Eraser} disabled={!hasMeasures} onClick={onClearMeasures} />
      {children}
    </div>
  );
}
