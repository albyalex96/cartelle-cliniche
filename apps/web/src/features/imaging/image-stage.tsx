'use client';

import type { ImagingGeometryDTO } from '@alby/shared';
import { ImageOff } from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { cn } from '@/lib/utils';
import { previewUrl } from './preview-url';
import { clamp, DEFAULT_VIEW, measureLabel, rotateVector, zoomBy, type Measure, type Point, type Tool, type View } from './viewer-tools';

// Scala delle immagini già chieste al server (una richiesta per immagine, solo quando si misura).
const geometries = new Map<string, Promise<ImagingGeometryDTO | null>>();
function loadGeometry(id: string) {
  let p = geometries.get(id);
  if (!p) {
    p = fetch(`/api/imaging/${id}/geometry`)
      // 415 = il file non dichiara le dimensioni: è una risposta definitiva, si ricorda.
      .then((r) => (r.ok ? (r.json() as Promise<ImagingGeometryDTO>) : r.status === 415 ? null : Promise.reject(new Error(String(r.status)))))
      .catch(() => {
        geometries.delete(id); // errore temporaneo: si riproverà
        return null;
      });
    geometries.set(id, p);
  }
  return p;
}

/** `undefined` finché non arriva, `null` se non disponibile. */
function useGeometry(id: string, enabled: boolean) {
  const [state, setState] = useState<{ id: string; value: ImagingGeometryDTO | null } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void loadGeometry(id).then((value) => alive && setState({ id, value }));
    return () => {
      alive = false;
    };
  }, [id, enabled]);
  return state?.id === id ? state.value : undefined;
}

type Drag = { kind: 'measure' } | { kind: 'pan' | 'adjust'; x: number; y: number; view: View };

/**
 * Un'immagine con i suoi strumenti: zoom (Ctrl + rotellina), spostamento, luminosità e contrasto,
 * rotazione e specchio, misura delle distanze. Lo stato sta in chi la usa (`view`, `measures`), così più riquadri
 * possono essere comandati dalla stessa barra.
 */
export function ImageStage({
  id,
  alt,
  tool,
  view,
  onViewChange,
  measures,
  onMeasuresChange,
  onStep,
  className,
}: {
  id: string;
  alt: string;
  tool: Tool;
  view: View;
  onViewChange: (view: View) => void;
  measures: Measure[];
  onMeasuresChange: (measures: Measure[]) => void;
  /** Rotellina: immagine successiva (+1) o precedente (−1). */
  onStep: (by: number) => void;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [loaded, setLoaded] = useState<{ id: string; w: number; h: number } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ a: Point; b: Point } | null>(null);
  const drag = useRef<Drag | null>(null);
  const geometry = useGeometry(id, measures.length > 0 || draft !== null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => entry && setSize({ w: entry.contentRect.width, h: entry.contentRect.height }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Posizione dell'immagine nel riquadro: ruotata, adattata, poi ingrandita e spostata (senza uscire dai bordi).
  // `rect` è il riquadro occupato sullo schermo (già ruotato); `img` le dimensioni dell'immagine non ruotata.
  const natural = loaded?.id === id ? loaded : null;
  let rect: { left: number; top: number; width: number; height: number } | null = null;
  let img = { w: 0, h: 0 };
  let shown = view;
  if (natural && size.w > 0 && size.h > 0) {
    const sideways = view.rotation % 180 !== 0;
    const nw = sideways ? natural.h : natural.w;
    const nh = sideways ? natural.w : natural.h;
    const fit = Math.min(size.w / nw, size.h / nh);
    const width = nw * fit * view.zoom;
    const height = nh * fit * view.zoom;
    const maxX = Math.max(0, (width - size.w) / 2);
    const maxY = Math.max(0, (height - size.h) / 2);
    shown = { ...view, x: clamp(view.x, -maxX, maxX), y: clamp(view.y, -maxY, maxY) };
    rect = { left: (size.w - width) / 2 + shown.x, top: (size.h - height) / 2 + shown.y, width, height };
    img = { w: natural.w * fit * view.zoom, h: natural.h * fit * view.zoom };
  }

  // La rotellina va ascoltata "a mano" per poter fermare lo zoom della pagina del browser.
  const live = useRef({ view: shown, onViewChange, onStep });
  useEffect(() => {
    live.current = { view: shown, onViewChange, onStep };
  });
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let acc = 0;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { view, onViewChange, onStep } = live.current;
      if (e.ctrlKey || e.metaKey) {
        const r = el.getBoundingClientRect();
        onViewChange(zoomBy(view, Math.exp(-e.deltaY / 300), { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 }));
        return;
      }
      // Un'immagine ogni "scatto", non una per ogni piccolo movimento del touchpad.
      acc += e.deltaY;
      if (Math.abs(acc) < 60) return;
      onStep(acc > 0 ? 1 : -1);
      acc = 0;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Dal puntatore al punto dell'immagine (in frazioni dell'immagine non ruotata) e ritorno.
  const toPoint = (e: ReactPointerEvent): Point => {
    const r = box.current!.getBoundingClientRect();
    const d = rotateVector({ x: e.clientX - r.left - rect!.left - rect!.width / 2, y: e.clientY - r.top - rect!.top - rect!.height / 2 }, -shown.rotation);
    return { x: clamp((shown.flip ? -d.x : d.x) / img.w + 0.5, 0, 1), y: clamp(d.y / img.h + 0.5, 0, 1) };
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !rect) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    if (tool === 'measure') {
      const p = toPoint(e);
      drag.current = { kind: 'measure' };
      setDraft({ a: p, b: p });
    } else {
      drag.current = { kind: tool, x: e.clientX, y: e.clientY, view: shown };
    }
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || !rect) return;
    if (d.kind === 'measure') {
      const b = toPoint(e);
      setDraft((m) => m && { a: m.a, b });
    } else if (d.kind === 'pan') {
      onViewChange({ ...d.view, x: d.view.x + e.clientX - d.x, y: d.view.y + e.clientY - d.y });
    } else {
      // Come nei visualizzatori radiologici: orizzontale = contrasto, verticale = luminosità.
      onViewChange({
        ...d.view,
        contrast: clamp(d.view.contrast + (e.clientX - d.x) / 200, 0.2, 3),
        brightness: clamp(d.view.brightness - (e.clientY - d.y) / 200, 0.2, 3),
      });
    }
  };
  const onPointerEnd = (commit: boolean) => {
    const d = drag.current;
    drag.current = null;
    if (d?.kind !== 'measure') return;
    // Un clic senza trascinare non è una misura.
    if (commit && draft && rect && Math.hypot((draft.b.x - draft.a.x) * img.w, (draft.b.y - draft.a.y) * img.h) >= 4) {
      onMeasuresChange([...measures, { id: Math.max(0, ...measures.map((m) => m.id)) + 1, ...draft }]);
    }
    setDraft(null);
  };

  if (failed === id) {
    return (
      <div ref={box} className={cn('flex flex-col items-center justify-center gap-1 bg-black p-2 text-center text-xs text-neutral-400', className)}>
        <ImageOff className="size-5" />
        Anteprima non disponibile
      </div>
    );
  }

  const px = (p: Point) => {
    const dx = (p.x - 0.5) * img.w;
    const d = rotateVector({ x: shown.flip ? -dx : dx, y: (p.y - 0.5) * img.h }, shown.rotation);
    return { x: rect!.left + rect!.width / 2 + d.x, y: rect!.top + rect!.height / 2 + d.y };
  };
  const lines = rect && natural ? [...measures.map((m) => ({ ...m, saved: true })), ...(draft ? [{ id: -1, ...draft, saved: false }] : [])] : [];

  return (
    <div
      ref={box}
      className={cn(
        'relative touch-none overflow-hidden bg-black select-none',
        tool === 'measure' ? 'cursor-crosshair' : tool === 'adjust' ? 'cursor-move' : shown.zoom > 1 ? 'cursor-grab active:cursor-grabbing' : undefined,
        className,
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => onPointerEnd(true)}
      onPointerCancel={() => onPointerEnd(false)}
      onDoubleClick={() => tool === 'pan' && onViewChange({ ...view, zoom: DEFAULT_VIEW.zoom, x: 0, y: 0 })}
    >
      {/* Immagini riservate servite dall'app stessa: niente ottimizzazione di next/image. */}
      <img
        key={id}
        src={previewUrl(id, 'full')}
        alt={alt}
        decoding="async"
        draggable={false}
        onLoad={(e) => setLoaded({ id, w: e.currentTarget.naturalWidth || 1, h: e.currentTarget.naturalHeight || 1 })}
        onError={() => setFailed(id)}
        className={cn('absolute', rect ? 'max-w-none' : 'inset-0 size-full object-contain')}
        style={{
          ...(rect && {
            left: rect.left + (rect.width - img.w) / 2,
            top: rect.top + (rect.height - img.h) / 2,
            width: img.w,
            height: img.h,
          }),
          transform: shown.rotation || shown.flip ? `rotate(${shown.rotation}deg) scaleX(${shown.flip ? -1 : 1})` : undefined,
          filter: `brightness(${shown.brightness}) contrast(${shown.contrast})${shown.invert ? ' invert(1)' : ''}`,
        }}
      />
      {lines.length > 0 && (
        <svg className="pointer-events-none absolute inset-0 size-full">
          {lines.map((m) => {
            const a = px(m.a);
            const b = px(m.b);
            const label = measureLabel(m, geometry, natural!);
            // Etichetta accanto all'estremo più in alto, dentro il riquadro.
            const top = a.y <= b.y ? a : b;
            const tx = clamp(top.x + 8, 4, Math.max(4, size.w - 90));
            const ty = clamp(top.y - 8, 14, Math.max(14, size.h - 6));
            return (
              <g key={m.id}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="black" strokeOpacity={0.6} strokeWidth={4} strokeLinecap="round" />
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#fde047" strokeWidth={1.5} strokeLinecap="round" />
                {[a, b].map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r={3} fill="#fde047" stroke="black" strokeOpacity={0.6} />
                ))}
                <text
                  x={tx}
                  y={ty}
                  fill="#fde047"
                  stroke="black"
                  strokeOpacity={0.75}
                  strokeWidth={3}
                  paintOrder="stroke"
                  fontSize={13}
                  fontWeight={600}
                  className={cn('tabular-nums', m.saved && tool === 'measure' && 'pointer-events-auto cursor-pointer')}
                  onPointerDown={(e) => m.saved && tool === 'measure' && e.stopPropagation()}
                  onClick={() => m.saved && tool === 'measure' && onMeasuresChange(measures.filter((x) => x.id !== m.id))}
                >
                  {m.saved && tool === 'measure' && <title>Clic per eliminare questa misura</title>}
                  {label}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
