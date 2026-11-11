/** Valori degli esami di laboratorio: funzioni pure, usate sia dal server sia dal browser. */

/** "13,8" → 13.8; "1.234,5" → 1234.5; "< 0,5" → 0.5. */
export function parseItalianNumber(text: string): number | undefined {
  const m = /^[<>≤≥]?\s*(-?\d{1,3}(?:\.\d{3})+(?:,\d+)?|-?\d+(?:[.,]\d+)?)$/.exec(text.trim());
  if (!m) return undefined;
  let n = m[1]!;
  n = /\.\d{3}(?:,|$)/.test(n) && n.includes(',') ? n.replace(/\./g, '').replace(',', '.') : n.replace(',', '.');
  const v = Number(n);
  return Number.isFinite(v) ? v : undefined;
}

/** Intervallo di riferimento: "12,0 - 16,0" → {low: 12, high: 16}; "< 200" → {high: 200}; "> 40" → {low: 40}. */
export function parseReferenceRange(riferimento?: string | null): { low?: number; high?: number } | undefined {
  if (!riferimento) return undefined;
  const range = /(\d+(?:[.,]\d+)?)\s*[-–÷]\s*(\d+(?:[.,]\d+)?)/.exec(riferimento);
  if (range) return { low: parseItalianNumber(range[1]!)!, high: parseItalianNumber(range[2]!)! };
  const lt = /^\s*(?:[<≤]|fino a)\s*(\d+(?:[.,]\d+)?)/i.exec(riferimento);
  if (lt) return { high: parseItalianNumber(lt[1]!)! };
  const gt = /^\s*(?:[>≥]|oltre)\s*(\d+(?:[.,]\d+)?)/i.exec(riferimento);
  if (gt) return { low: parseItalianNumber(gt[1]!)! };
  return undefined;
}

/** Il valore è fuori dall'intervallo di riferimento ("12,0 - 16,0", "< 200", "> 40")? `undefined` se non si può dire. */
export function isOutOfRange(n: number | undefined, riferimento?: string): boolean | undefined {
  if (n === undefined) return undefined;
  const r = parseReferenceRange(riferimento);
  if (!r) return undefined;
  return (r.low !== undefined && n < r.low) || (r.high !== undefined && n > r.high);
}
