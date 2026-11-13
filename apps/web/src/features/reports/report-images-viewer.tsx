'use client';

import { ChevronLeft, ChevronRight, ExternalLink, Maximize2 } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ImageStage } from '@/features/imaging/image-stage';
import { ToolbarButton, ToolbarDivider } from '@/components/toolbar-button';
import { ImageTools, TOOL_HINTS } from '@/features/imaging/image-tools';
import { StudyViewerDialog, type ViewerImage } from '@/features/imaging/study-viewer-dialog';
import type { ViewerSeries } from '@/features/imaging/viewer-series';
import { DEFAULT_VIEW, type Measure, type Tool, type View } from '@/features/imaging/viewer-tools';

export interface ReportViewerStudy {
  id: string;
  title: string;
  /** Pagina dello studio, con tutte le miniature. */
  href: string;
  series: ViewerSeries[];
}

/**
 * Immagini collegate al referto, da scorrere accanto al testo (frecce, tastiera o rotellina), con gli
 * strumenti del visualizzatore (zoom, rotazione, specchio, luminosità e contrasto, negativo, misure)
 * e l'apertura a tutto schermo. Riceve dal server dati già pronti.
 */
export function ReportImagesViewer({ studies, report }: { studies: ReportViewerStudy[]; report?: { title: string; body: string } | null }) {
  // Tutte le immagini di tutti gli studi collegati in un'unica sequenza: le frecce passano
  // da una serie all'altra e da uno studio al successivo.
  const { images, firstOfStudy, firstOfSeries } = useMemo(() => {
    const images: { id: string; studyIndex: number; seriesIndex: number; label: string }[] = [];
    const firstOfStudy: number[] = [];
    const firstOfSeries: number[][] = [];
    studies.forEach((st, sti) => {
      firstOfStudy.push(images.length);
      firstOfSeries.push([]);
      st.series.forEach((s, si) => {
        firstOfSeries[sti]!.push(images.length);
        s.imageIds.forEach((id, n) =>
          images.push({ id, studyIndex: sti, seriesIndex: si, label: `${s.name}, immagine ${n + 1}` }),
        );
      });
    });
    return { images, firstOfStudy, firstOfSeries };
  }, [studies]);

  const [index, setIndex] = useState(0);
  const last = images.length - 1;
  const move = (by: number) => setIndex((i) => Math.min(last, Math.max(0, i + by)));
  const current = images[Math.min(index, last)]!;
  const study = studies[current.studyIndex]!;
  const { series } = study;
  const currentSeries = series[current.seriesIndex]!;

  // Strumenti: la vista (zoom, rotazione…) resta mentre si scorre; le misure valgono per la singola immagine.
  const [tool, setTool] = useState<Tool>('pan');
  const [view, setView] = useState<View>(DEFAULT_VIEW);
  const [measures, setMeasures] = useState<Record<string, Measure[]>>({});
  const imageMeasures = measures[current.id] ?? [];

  // Tutto schermo: le immagini dello studio corrente, partendo da quella mostrata.
  const [fullscreen, setFullscreen] = useState(false);
  const studyImages = useMemo<ViewerImage[]>(
    () => series.flatMap((s, si) => s.imageIds.map((id, n) => ({ id, seriesIndex: si, position: n + 1, label: `${s.name}, immagine ${n + 1}` }))),
    [series],
  );
  const studyFirstOf = firstOfSeries[current.studyIndex]!.map((i) => i - firstOfStudy[current.studyIndex]!);

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {studies.length > 1 ? (
          <Select value={String(current.studyIndex)} onValueChange={(v) => setIndex(firstOfStudy[Number(v)]!)}>
            <SelectTrigger size="sm" className="min-w-0 max-w-full flex-1" aria-label="Studio">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {studies.map((s, sti) => (
                <SelectItem key={s.id} value={String(sti)}>
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

      <ImageTools
        tool={tool}
        onToolChange={setTool}
        view={view}
        onViewChange={setView}
        hasMeasures={imageMeasures.length > 0}
        onClearMeasures={() => setMeasures((all) => ({ ...all, [current.id]: [] }))}
      >
        <ToolbarDivider />
        <ToolbarButton label="Apri a tutto schermo" icon={Maximize2} onClick={() => setFullscreen(true)} />
      </ImageTools>

      <div
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
        className="relative aspect-square overflow-hidden rounded-xl bg-black outline-none focus-visible:ring-2 focus-visible:ring-ring lg:aspect-auto lg:h-[calc(100svh-var(--viewer-offset,7rem)-9rem)] lg:min-h-64"
      >
        <ImageStage
          id={current.id}
          alt={current.label}
          tool={tool}
          view={view}
          onViewChange={setView}
          measures={imageMeasures}
          onMeasuresChange={(next) => setMeasures((all) => ({ ...all, [current.id]: next }))}
          onStep={move}
          className="size-full"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        {series.length > 1 ? (
          <Select value={String(current.seriesIndex)} onValueChange={(v) => setIndex(firstOfSeries[current.studyIndex]![Number(v)]!)}>
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
          {/* Posizione nella sequenza di tutte le immagini del referto (le frecce le scorrono tutte). */}
          <span className="text-sm tabular-nums text-muted-foreground" aria-label={`Immagine ${Math.min(index, last) + 1} di ${images.length}`}>
            {Math.min(index, last) + 1}/{images.length}
          </span>
          <Button type="button" variant="outline" size="icon-sm" aria-label="Immagine precedente" onClick={() => move(-1)} disabled={index <= 0}>
            <ChevronLeft />
          </Button>
          <Button type="button" variant="outline" size="icon-sm" aria-label="Immagine successiva" onClick={() => move(1)} disabled={index >= last}>
            <ChevronRight />
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{TOOL_HINTS[tool]} Anteprima non adatta alla diagnosi.</p>

      {fullscreen && (
        <StudyViewerDialog
          series={series}
          images={studyImages}
          firstOf={studyFirstOf}
          start={Math.min(index, last) - firstOfStudy[current.studyIndex]!}
          report={report}
          onClose={() => setFullscreen(false)}
        />
      )}
    </div>
  );
}
