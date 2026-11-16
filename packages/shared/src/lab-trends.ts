/**
 * Andamento nel tempo degli esami di laboratorio: i valori di tutti i referti di un paziente, raggruppati per
 * esame (riconosciuto anche con nomi diversi) e per unità di misura. Codice puro: lo usano il server
 * (pagina "Andamento" della webapp) e l'app mobile, sulla sua copia locale.
 */
import { analyteCategoryRank, matchAnalyte, normalizeUnit, type AnalyteCategory } from './analytes';
import type { LabTrendDTO } from './dto';

/** Un valore di un referto, con la data e il titolo del referto da cui viene. */
export interface LabTrendRow {
  section: string | null;
  name: string;
  value: string;
  numericValue: number | null;
  unit: string | null;
  referenceRange: string | null;
  outOfRange: boolean | null;
  reportId: string;
  reportTitle: string;
  /** Data dell'esame (AAAA-MM-GG). */
  date: string;
}

/** `rows` in ordine cronologico (dal referto più vecchio); i punti di ogni andamento restano in quell'ordine. */
export function buildLabTrends(rows: readonly LabTrendRow[]): LabTrendDTO[] {
  const groups = new Map<string, LabTrendDTO>();
  for (const r of rows) {
    const analyte = matchAnalyte(r.name, r.section);
    const id = `${analyte.key}\u0000${normalizeUnit(r.unit)}`;
    let g = groups.get(id);
    if (!g) {
      g = { key: analyte.key, label: analyte.label, category: analyte.category, known: analyte.known, unit: r.unit, points: [], numericCount: 0 };
      groups.set(id, g);
    }
    g.points.push({
      date: r.date,
      value: r.value,
      numericValue: r.numericValue,
      outOfRange: r.outOfRange,
      referenceRange: r.referenceRange,
      name: r.name,
      reportId: r.reportId,
      reportTitle: r.reportTitle,
    });
    if (r.numericValue !== null) g.numericCount++;
  }

  return [...groups.values()]
    .map((g) => {
      // Esami non in catalogo: come nome si usa quello del referto più recente.
      if (!g.known) g.label = g.points.at(-1)!.name;
      return g;
    })
    .sort(
      (a, b) =>
        analyteCategoryRank(a.category as AnalyteCategory) - analyteCategoryRank(b.category as AnalyteCategory) ||
        Number(b.known) - Number(a.known) ||
        a.label.localeCompare(b.label, 'it') ||
        b.points.length - a.points.length,
    );
}
