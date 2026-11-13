'use client';

import { FileText, Images } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type View = 'pdf' | 'images';

/**
 * Pannello accanto al referto: PDF originale oppure immagini collegate, scelti con due pulsanti.
 * I due contenuti arrivano già pronti dal server; qui c'è solo il cambio di vista.
 */
export function ReportViewerPanel({ pdf, images, className }: { pdf?: ReactNode; images?: ReactNode; className?: string }) {
  const both = !!pdf && !!images;
  const [view, setView] = useState<View>(pdf ? 'pdf' : 'images');
  // Le immagini si caricano solo quando vengono aperte la prima volta; poi restano pronte.
  const [imagesOpened, setImagesOpened] = useState(!pdf);

  const chip = (value: View, label: string, icon: ReactNode) => (
    <Button
      type="button"
      size="sm"
      variant={view === value ? 'default' : 'outline'}
      className="rounded-full"
      aria-pressed={view === value}
      onClick={() => {
        setView(value);
        if (value === 'images') setImagesOpened(true);
      }}
    >
      {icon}
      {label}
    </Button>
  );

  return (
    <aside className={cn('grid min-w-0 gap-3 lg:sticky lg:top-4 lg:self-start', both && '[--viewer-offset:10rem]', className)}>
      {both && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Cosa mostrare accanto al referto">
          {chip('pdf', 'Visualizza referto originale', <FileText />)}
          {chip('images', 'Visualizza immagini', <Images />)}
        </div>
      )}
      {pdf && <div className={cn(view !== 'pdf' && 'hidden')}>{pdf}</div>}
      {images && imagesOpened && <div className={cn(view !== 'images' && 'hidden')}>{images}</div>}
    </aside>
  );
}
