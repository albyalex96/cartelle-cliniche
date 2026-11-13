'use client';

import { ImageOff } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { previewUrl } from './preview-url';
import { StudyViewerDialog, type ViewerImage } from './study-viewer-dialog';
import type { ViewerSeries } from './viewer-series';

/** Immagine con ripiego: alcuni formati DICOM compressi non hanno ancora un'anteprima. */
export function Preview({ id, size, alt, className }: { id: string; size: 'thumb' | 'full'; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className={cn('flex flex-col items-center justify-center gap-1 p-2 text-center text-xs text-neutral-400', className)}>
        <ImageOff className="size-5" />
        Anteprima non disponibile
      </span>
    );
  }
  // Immagini riservate servite dall'app stessa: niente ottimizzazione di next/image.
  return <img src={previewUrl(id, size)} alt={alt} loading={size === 'thumb' ? 'lazy' : undefined} decoding="async" className={className} onError={() => setFailed(true)} />;
}

/**
 * Miniature di uno studio, serie per serie; un clic apre la consultazione a tutto schermo
 * (`StudyViewerDialog`: più immagini affiancate, zoom, misure, testo del referto accanto).
 * Riceve dal server dati già pronti.
 */
export function StudyViewer({ series, report }: { series: ViewerSeries[]; report?: { title: string; body: string } | null }) {
  // Tutte le immagini dello studio in un'unica sequenza.
  const images = useMemo<ViewerImage[]>(
    () => series.flatMap((s, si) => s.imageIds.map((id, n) => ({ id, seriesIndex: si, position: n + 1, label: `${s.name}, immagine ${n + 1}` }))),
    [series],
  );
  const firstOf = useMemo(() => {
    let n = 0;
    return series.map((s) => (n += s.imageIds.length) - s.imageIds.length);
  }, [series]);

  // Immagine da cui aprire la consultazione a tutto schermo (`null` = chiusa).
  const [index, setIndex] = useState<number | null>(null);

  return (
    <>
      {series.map((s, si) => (
        <Card key={s.id}>
          <CardHeader>
            <CardTitle>{s.name}</CardTitle>
            <CardDescription>{s.caption}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2">
              {s.imageIds.map((id, n) => (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => setIndex(firstOf[si]! + n)}
                    aria-label={`Apri ${s.name}, immagine ${n + 1}`}
                    className="relative block aspect-square w-full overflow-hidden rounded-lg bg-black outline-none ring-offset-background transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <Preview id={id} size="thumb" alt={`${s.name}, immagine ${n + 1}`} className="size-full object-contain" />
                    <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[0.6875rem] tabular-nums text-white">{n + 1}</span>
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}

      {index !== null && <StudyViewerDialog series={series} images={images} firstOf={firstOf} start={index} report={report} onClose={() => setIndex(null)} />}
    </>
  );
}
