'use client';

import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Preview } from '@/features/imaging/study-viewer';
import type { ViewerSeries } from '@/features/imaging/viewer-series';

export interface ReportViewerStudy {
  id: string;
  title: string;
  /** Pagina dello studio, con tutte le miniature. */
  href: string;
  series: ViewerSeries[];
}

/**
 * Immagini collegate al referto, da scorrere accanto al testo (frecce, tastiera o rotellina).
 * Riceve dal server dati già pronti.
 */
export function ReportImagesViewer({ studies }: { studies: ReportViewerStudy[] }) {
  const [studyId, setStudyId] = useState(studies[0]!.id);
  const study = studies.find((s) => s.id === studyId) ?? studies[0]!;
  const { series } = study;

  // Tutte le immagini dello studio in un'unica sequenza.
  const images = useMemo(
    () => series.flatMap((s, si) => s.imageIds.map((id, n) => ({ id, seriesIndex: si, position: n + 1, label: `${s.name}, immagine ${n + 1}` }))),
    [series],
  );
  const firstOf = useMemo(() => {
    let n = 0;
    return series.map((s) => (n += s.imageIds.length) - s.imageIds.length);
  }, [series]);

  const [index, setIndex] = useState(0);
  const last = images.length - 1;
  const move = (by: number) => setIndex((i) => Math.min(last, Math.max(0, i + by)));
  const current = images[Math.min(index, last)]!;
  const currentSeries = series[current.seriesIndex]!;

  // Rotellina e touchpad: un'immagine ogni "scatto", senza far scorrere la pagina.
  const stage = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = stage.current;
    if (!el || last < 1) return;
    let acc = 0;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      acc += e.deltaY;
      if (Math.abs(acc) < 60) return;
      const by = acc > 0 ? 1 : -1;
      acc = 0;
      setIndex((i) => Math.min(last, Math.max(0, i + by)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [last]);

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {studies.length > 1 ? (
          <Select
            value={study.id}
            onValueChange={(v) => {
              setStudyId(v);
              setIndex(0);
            }}
          >
            <SelectTrigger size="sm" className="min-w-0 max-w-full flex-1" aria-label="Studio">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {studies.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground" title={study.title}>
            {study.title}
          </p>
        )}
        <Button variant="ghost" size="sm" className="shrink-0" asChild>
          <Link href={study.href}>
            <ExternalLink />
            Apri lo studio
          </Link>
        </Button>
      </div>

      <div
        ref={stage}
        tabIndex={0}
        role="group"
        aria-label={`Immagini: ${study.title}`}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            e.preventDefault();
            move(-1);
          }
          if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            e.preventDefault();
            move(1);
          }
        }}
        className="relative aspect-square overflow-hidden rounded-xl bg-black outline-none focus-visible:ring-2 focus-visible:ring-ring lg:aspect-auto lg:h-[calc(100svh-var(--viewer-offset,7rem)-6.5rem)] lg:min-h-64"
      >
        <Preview key={current.id} id={current.id} size="full" alt={current.label} className="size-full object-contain" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        {series.length > 1 ? (
          <Select value={String(current.seriesIndex)} onValueChange={(v) => setIndex(firstOf[Number(v)]!)}>
            <SelectTrigger size="sm" className="min-w-0 max-w-full sm:max-w-64" aria-label="Serie">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {series.map((s, si) => (
                <SelectItem key={s.id} value={String(si)}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="truncate text-sm text-muted-foreground">{currentSeries.name}</span>
        )}
        <div className="flex items-center gap-2">
          <span className="text-sm tabular-nums text-muted-foreground">
            {current.position} di {currentSeries.imageIds.length}
          </span>
          <Button type="button" variant="outline" size="icon-sm" aria-label="Immagine precedente" onClick={() => move(-1)} disabled={index <= 0}>
            <ChevronLeft />
          </Button>
          <Button type="button" variant="outline" size="icon-sm" aria-label="Immagine successiva" onClick={() => move(1)} disabled={index >= last}>
            <ChevronRight />
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Anteprima non adatta alla diagnosi.</p>
    </div>
  );
}
