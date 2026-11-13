import { formatUnit, type LabTrendDTO } from '@alby/shared';
import { Unit } from '@/components/unit';
import { formatDate } from '@/lib/format';
import { formatNumber, latestRange, niceTicks, numericPoints, timeDomain, timeTicks } from './chart-math';

interface Size {
  width: number;
  height: number;
  font: number;
  maxTimeTicks: number;
}

/** Due misure: il disegno è un SVG (scala con la larghezza), il testo deve restare leggibile anche sul telefono. */
const DESKTOP: Size = { width: 760, height: 300, font: 12, maxTimeTicks: 8 };
const MOBILE: Size = { width: 360, height: 240, font: 11, maxTimeTicks: 4 };

function Chart({ trend, size, className }: { trend: LabTrendDTO; size: Size; className: string }) {
  const points = numericPoints(trend);
  const { width: W, height: H, font } = size;
  const range = latestRange(trend.points);
  const values = points.map((p) => p.numericValue);
  const bounds = [...values, range?.low, range?.high].filter((v): v is number => v !== undefined);
  const { lo, hi, ticks } = niceTicks(Math.min(...bounds), Math.max(...bounds), size === MOBILE ? 4 : 5);
  const labelWidth = Math.max(...ticks.map((t) => formatNumber(t).length)) * font * 0.62;
  const m = { top: 12, right: 16, bottom: font + 14, left: Math.ceil(labelWidth) + 12 };
  const [t0, t1] = timeDomain(points);
  const x = (t: number) => m.left + ((t - t0) / (t1 - t0)) * (W - m.left - m.right);
  const y = (v: number) => m.top + (1 - (v - lo) / (hi - lo || 1)) * (H - m.top - m.bottom);
  const bandTop = y(range?.high ?? hi);
  const bandBottom = y(range?.low ?? lo);
  const unit = trend.unit ? ` ${formatUnit(trend.unit)}` : '';
  const last = points.at(-1)!;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={className}
      role="img"
      aria-label={`Andamento di ${trend.label}: ${points.length} valori dal ${formatDate(points[0]!.date)} al ${formatDate(last.date)}. La tabella sotto riporta tutti i valori.`}
      style={{ fontSize: font }}
    >
      {/* Intervallo di riferimento */}
      {range && <rect x={m.left} width={W - m.left - m.right} y={bandTop} height={Math.max(1, bandBottom - bandTop)} className="fill-primary/10" />}
      {/* Griglia orizzontale e valori */}
      {ticks.map((t) => (
        <g key={t}>
          <line x1={m.left} x2={W - m.right} y1={y(t)} y2={y(t)} className="stroke-border" strokeWidth={1} />
          <text x={m.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground tabular-nums">
            {formatNumber(t)}
          </text>
        </g>
      ))}
      {/* Asse del tempo */}
      {timeTicks([t0, t1], size.maxTimeTicks).map(({ t, label }) => (
        <text key={t} x={x(t)} y={H - 6} textAnchor="middle" className="fill-muted-foreground">
          {label}
        </text>
      ))}
      {/* Linea */}
      <polyline
        points={points.map((p) => `${x(p.t).toFixed(1)},${y(p.numericValue).toFixed(1)}`).join(' ')}
        fill="none"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        className="stroke-primary"
      />
      {/* Punti: quelli fuori intervallo in rosso e più grandi; al passaggio del mouse il valore */}
      {points.map((p, i) => (
        <g key={i}>
          <circle
            cx={x(p.t)}
            cy={y(p.numericValue)}
            r={p.outOfRange ? 5.5 : 4.5}
            strokeWidth={2}
            className={p.outOfRange ? 'fill-destructive stroke-card' : 'fill-primary stroke-card'}
          />
          <circle cx={x(p.t)} cy={y(p.numericValue)} r={14} fill="transparent">
            <title>{`${formatDate(p.date)}: ${p.value}${unit}${p.outOfRange ? ' (fuori intervallo)' : ''}`}</title>
          </circle>
        </g>
      ))}
      {/* Etichetta diretta solo sull'ultimo valore */}
      <text
        x={x(last.t)}
        y={y(last.numericValue) - 12}
        textAnchor={x(last.t) > W - 60 ? 'end' : 'middle'}
        className="fill-foreground font-medium tabular-nums"
      >
        {last.value}
      </text>
    </svg>
  );
}

/** Grafico dell'andamento di un esame (SVG disegnato sul server). Servono almeno due valori numerici. */
export function TrendChart({ trend }: { trend: LabTrendDTO }) {
  if (numericPoints(trend).length < 2) return null;
  const range = latestRange(trend.points);
  const hasOut = trend.points.some((p) => p.outOfRange && p.numericValue !== null);
  return (
    <figure className="grid gap-2">
      <Chart trend={trend} size={DESKTOP} className="hidden h-auto w-full sm:block" />
      <Chart trend={trend} size={MOBILE} className="h-auto w-full sm:hidden" />
      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {trend.unit && <span>Valori in <Unit value={trend.unit} /></span>}
        {range && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-3 rounded-sm bg-primary/15" aria-hidden />
            Intervallo di riferimento (dal referto più recente)
          </span>
        )}
        {hasOut && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-full bg-destructive" aria-hidden />
            Fuori intervallo
          </span>
        )}
      </figcaption>
    </figure>
  );
}
