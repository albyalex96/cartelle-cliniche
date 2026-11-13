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

const SUPERSCRIPT: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻' };
const superscript = (digits: string) => [...digits].map((c) => SUPERSCRIPT[c] ?? c).join('');

/**
 * Unità di misura come si scrive a mano: "x10^6/uL" → "×10⁶/μL", "mL/min/1.73m2" → "mL/min/1,73 m²".
 * Solo per mostrarla: il dato salvato resta il testo semplice letto dal referto.
 * "u" diventa "μ" solo davanti a unità note (uL, ug, umol…): "U/L" e "UI/mL" restano come sono.
 */
export function formatUnit(unit: string): string {
  return (
    unit
      // Potenze di dieci: "x10^6", "x 10*3", "10E9", "10^-3".
      .replace(/(?:([x×*])\s*)?10\s*(?:\^|\*\*?|[eE])\s*(-?\d+)/g, (_, times: string | undefined, exp: string) => `${times ? '×' : ''}10${superscript(exp)}`)
      // Altri esponenti espliciti: "m^2".
      .replace(/\^(-?\d+)/g, (_, exp: string) => superscript(exp))
      // Metri quadri e cubi: "m2", "mm3", "mmc".
      .replace(/(?<![A-Za-zµμ])(m|dm|cm|mm)([23])(?![\dA-Za-z])/g, (_, base: string, exp: string) => base + superscript(exp))
      .replace(/(?<![A-Za-zµμ])mmc(?![A-Za-z])/g, 'mm³')
      // Micro scritto con la "u".
      .replace(/(?<![A-Za-zµμ])u(?=(?:L|l|g|mol|m|UI|IU|U|kat|Eq)(?![A-Za-z]))/g, 'μ')
      .replace(/µ/g, 'μ')
      // Decimali all'italiana e spazio tra numero e unità: "1.73m²" → "1,73 m²".
      .replace(/(\d)\.(\d)/g, '$1,$2')
      .replace(/(\d)(m[²³])/g, '$1 $2')
  );
}
