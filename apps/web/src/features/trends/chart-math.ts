/** Calcoli per i grafici dell'andamento (puri: usati dai Server Component che disegnano l'SVG). */
import { parseReferenceRange, type LabTrendDTO, type LabTrendPointDTO } from '@alby/shared';

export type NumericPoint = LabTrendPointDTO & { numericValue: number; t: number };

const DAY = 86_400_000;
export const timeOf = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

export function numericPoints(trend: LabTrendDTO): NumericPoint[] {
  return trend.points.filter((p): p is NumericPoint => p.numericValue !== null).map((p) => ({ ...p, t: timeOf(p.date) }));
}

/** Intervallo di riferimento più recente tra quelli scritti nei referti. */
export function latestRange(points: LabTrendPointDTO[]) {
  for (let i = points.length - 1; i >= 0; i--) {
    const r = parseReferenceRange(points[i]!.referenceRange);
    if (r) return r;
  }
  return undefined;
}

/** Tacche "tonde" (1, 2, 2,5, 5 × 10ⁿ) che coprono [min, max]. */
export function niceTicks(min: number, max: number, count = 5) {
  if (min === max) {
    const pad = Math.abs(min) * 0.1 || 1;
    min -= pad;
    max += pad;
  }
  const raw = (max - min) / Math.max(1, count - 1);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * mag >= raw) ?? 10) * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Number(v.toPrecision(12)));
  return { lo, hi, ticks, step };
}

/** Dominio del tempo: con un solo valore (o tutti nello stesso giorno) si allarga di qualche settimana. */
export function timeDomain(points: NumericPoint[]): [number, number] {
  const t0 = points[0]!.t;
  const t1 = points.at(-1)!.t;
  if (t1 - t0 < DAY) return [t0 - 30 * DAY, t1 + 30 * DAY];
  const pad = (t1 - t0) * 0.04;
  return [t0 - pad, t1 + pad];
}

const monthYear = new Intl.DateTimeFormat('it-IT', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const year = new Intl.DateTimeFormat('it-IT', { year: 'numeric', timeZone: 'UTC' });

/** Etichette dell'asse del tempo: inizio di mesi o anni, al massimo `max`. */
export function timeTicks([t0, t1]: [number, number], max: number): { t: number; label: string }[] {
  const months = (t1 - t0) / (30.4 * DAY);
  const stepMonths = [1, 2, 3, 6, 12, 24, 60].find((s) => months / s <= max) ?? 120;
  const d = new Date(t0);
  let y = d.getUTCFullYear();
  let m = d.getUTCMonth() + 1;
  if (stepMonths >= 12) {
    m = 0;
    y += 1;
  } else m = Math.ceil(m / stepMonths) * stepMonths;
  const out: { t: number; label: string }[] = [];
  for (;;) {
    const t = Date.UTC(y + Math.floor(m / 12), m % 12, 1);
    if (t > t1) break;
    if (t >= t0) out.push({ t, label: (stepMonths >= 12 ? year : monthYear).format(t) });
    m += stepMonths;
  }
  return out;
}

const numberFmt = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 3 });
export const formatNumber = (n: number) => numberFmt.format(n);
