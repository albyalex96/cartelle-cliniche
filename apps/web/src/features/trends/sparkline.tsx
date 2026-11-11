import type { LabTrendDTO } from '@alby/shared';
import { latestRange, numericPoints, timeDomain } from './chart-math';

const W = 120;
const H = 32;
const PAD = 4;

/** Mini-grafico dell'andamento, per l'elenco degli esami (SVG disegnato sul server, nessun JavaScript). */
export function Sparkline({ trend }: { trend: LabTrendDTO }) {
  const points = numericPoints(trend);
  if (points.length < 2) return <span className="text-xs text-muted-foreground">{points.length ? '1 valore' : '—'}</span>;

  const [t0, t1] = timeDomain(points);
  const range = latestRange(trend.points);
  const values = points.map((p) => p.numericValue);
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (range?.low !== undefined) lo = Math.min(lo, range.low);
  if (range?.high !== undefined) hi = Math.max(hi, range.high);
  if (hi === lo) hi = lo + 1;
  const x = (t: number) => PAD + ((t - t0) / (t1 - t0)) * (W - 2 * PAD);
  const y = (v: number) => H - PAD - ((v - lo) / (hi - lo)) * (H - 2 * PAD);
  const last = points.at(-1)!;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="overflow-visible" aria-hidden>
      {range && (
        <rect
          x={PAD}
          width={W - 2 * PAD}
          y={y(range.high ?? hi)}
          height={Math.max(1, y(range.low ?? lo) - y(range.high ?? hi))}
          rx={2}
          className="fill-primary/10"
        />
      )}
      <polyline
        points={points.map((p) => `${x(p.t).toFixed(1)},${y(p.numericValue).toFixed(1)}`).join(' ')}
        fill="none"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        className="stroke-primary"
      />
      <circle
        cx={x(last.t)}
        cy={y(last.numericValue)}
        r={3}
        strokeWidth={1.5}
        className={last.outOfRange ? 'fill-destructive stroke-card' : 'fill-primary stroke-card'}
      />
    </svg>
  );
}
