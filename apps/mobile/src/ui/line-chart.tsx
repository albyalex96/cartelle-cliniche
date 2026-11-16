import { parseReferenceRange, type LabTrendPointDTO } from '@alby/shared';
import { useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { formatMonth } from '@/lib/format';
import { useTheme } from './theme';

const HEIGHT = 180;
const PAD = { top: 12, bottom: 22, left: 44, right: 12 };
const DOT = 9;

const fmt = (n: number) => (Math.abs(n) >= 100 ? n.toFixed(0) : Number(n.toPrecision(3)).toString()).replace('.', ',');

/**
 * Grafico dell'andamento di un esame: valori nel tempo (asse orizzontale proporzionale alle date), con la fascia
 * dei valori di riferimento (dell'ultimo referto) e i punti fuori range evidenziati.
 * Disegnato con semplici View: niente librerie native, funziona ovunque.
 */
export function LineChart({ points }: { points: LabTrendPointDTO[] }) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  const numeric = points.filter((p): p is LabTrendPointDTO & { numericValue: number } => p.numericValue !== null);
  if (numeric.length === 0) return null;

  const range = parseReferenceRange(numeric.at(-1)!.referenceRange);
  const values = numeric.map((p) => p.numericValue);
  let min = Math.min(...values, range?.low ?? Infinity);
  let max = Math.max(...values, range?.high ?? -Infinity);
  if (min === max) {
    min -= Math.abs(min) * 0.1 || 1;
    max += Math.abs(max) * 0.1 || 1;
  }
  const pad = (max - min) * 0.08;
  min -= pad;
  max += pad;

  const times = numeric.map((p) => Date.parse(p.date));
  const t0 = Math.min(...times);
  const t1 = Math.max(...times);
  const plotW = Math.max(width - PAD.left - PAD.right, 1);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const x = (time: number) => PAD.left + (t1 === t0 ? plotW / 2 : ((time - t0) / (t1 - t0)) * plotW);
  const y = (v: number) => PAD.top + (1 - (v - min) / (max - min)) * plotH;
  const xy = numeric.map((p, i) => ({ x: x(times[i]!), y: y(p.numericValue), out: p.outOfRange === true }));

  const band =
    range && (range.low !== undefined || range.high !== undefined)
      ? { top: y(range.high ?? max), bottom: y(range.low ?? min) }
      : null;

  return (
    <View
      style={{ height: HEIGHT }}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      accessible
      accessibilityLabel={`Grafico di ${numeric.length} valori, dal ${numeric[0]!.date} al ${numeric.at(-1)!.date}`}
    >
      {width > 0 && (
        <>
          {band && (
            <View
              style={[
                styles.abs,
                { left: PAD.left, width: plotW, top: band.top, height: Math.max(band.bottom - band.top, 1), backgroundColor: t.primarySurface },
              ]}
            />
          )}
          <View style={[styles.abs, { left: PAD.left, top: PAD.top + plotH, width: plotW, height: 1, backgroundColor: t.border }]} />
          <Text style={[styles.abs, styles.axis, { color: t.muted, top: PAD.top - 7, left: 0, width: PAD.left - 6 }]}>{fmt(max)}</Text>
          <Text style={[styles.abs, styles.axis, { color: t.muted, top: PAD.top + plotH - 7, left: 0, width: PAD.left - 6 }]}>{fmt(min)}</Text>
          <Text style={[styles.abs, styles.date, { color: t.muted, top: HEIGHT - 16, left: PAD.left }]}>{formatMonth(numeric[0]!.date)}</Text>
          {numeric.length > 1 && (
            <Text style={[styles.abs, styles.date, { color: t.muted, top: HEIGHT - 16, right: PAD.right }]}>{formatMonth(numeric.at(-1)!.date)}</Text>
          )}
          {xy.slice(1).map((b, i) => {
            const a = xy[i]!;
            const length = Math.hypot(b.x - a.x, b.y - a.y);
            const angle = Math.atan2(b.y - a.y, b.x - a.x);
            return (
              <View
                key={`l${i}`}
                style={[
                  styles.abs,
                  {
                    left: (a.x + b.x) / 2 - length / 2,
                    top: (a.y + b.y) / 2 - 1,
                    width: length,
                    height: 2,
                    backgroundColor: t.primary,
                    transform: [{ rotate: `${angle}rad` }],
                  },
                ]}
              />
            );
          })}
          {xy.map((p, i) => (
            <View
              key={`p${i}`}
              style={[
                styles.abs,
                styles.dot,
                { left: p.x - DOT / 2, top: p.y - DOT / 2, backgroundColor: p.out ? t.warning : t.primary, borderColor: t.surface },
              ]}
            />
          ))}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  abs: { position: 'absolute' },
  axis: { fontSize: 11, textAlign: 'right' },
  date: { fontSize: 11 },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2, borderWidth: 1.5 },
});
