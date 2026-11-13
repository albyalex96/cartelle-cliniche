import { formatUnit } from '@alby/shared';

const DIGITS: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '−' };

/**
 * Unità di misura in forma naturale ("×10⁶/μL"), con gli esponenti come veri apici: quelli già pronti
 * del font sono troppo piccoli per leggerli bene. File neutro: usato da Server e Client Component.
 */
export function Unit({ value }: { value: string }) {
  const parts = formatUnit(value).split(/([⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+)/);
  return (
    <span className="whitespace-nowrap">
      {parts.map((part, i) =>
        i % 2 ? (
          <sup key={i} className="text-[0.9em]">
            {[...part].map((c) => DIGITS[c]).join('')}
          </sup>
        ) : (
          part
        ),
      )}
    </span>
  );
}
