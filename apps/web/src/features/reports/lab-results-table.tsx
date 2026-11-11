import { parseItalianNumber, type LabResultDTO } from '@alby/shared';
import { ArrowDown, ArrowUp, CircleAlert } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

/** Sopra o sotto l'intervallo? Solo per intervalli "min - max" con valore numerico. */
function direction(r: LabResultDTO): 'up' | 'down' | null {
  if (!r.outOfRange || r.numericValue === null || !r.referenceRange) return null;
  const m = /(\d+(?:[.,]\d+)?)\s*[-–÷]\s*(\d+(?:[.,]\d+)?)/.exec(r.referenceRange);
  if (m) return r.numericValue < parseItalianNumber(m[1]!)! ? 'down' : 'up';
  if (/^[<≤]/.test(r.referenceRange)) return 'up';
  if (/^[>≥]/.test(r.referenceRange)) return 'down';
  return null;
}

/** Valori di un esame di laboratorio, divisi per sezione (Server Component). */
export function LabResultsTable({ results }: { results: LabResultDTO[] }) {
  const rows: ({ type: 'section'; name: string } | { type: 'result'; r: LabResultDTO })[] = [];
  let section: string | null = null;
  for (const r of results) {
    if (r.section && r.section !== section) rows.push({ type: 'section', name: r.section });
    section = r.section;
    rows.push({ type: 'result', r });
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Esame</TableHead>
          <TableHead className="text-right">Valore</TableHead>
          <TableHead>Unità</TableHead>
          <TableHead className="hidden sm:table-cell">Riferimento</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, i) => {
          if (row.type === 'section') {
            return (
              <TableRow key={`s${i}`} className="hover:bg-transparent">
                <TableCell colSpan={4} className="pt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {row.name}
                </TableCell>
              </TableRow>
            );
          }
          const { r } = row;
          const dir = direction(r);
          const Icon = dir === 'up' ? ArrowUp : dir === 'down' ? ArrowDown : CircleAlert;
          return (
            <TableRow key={r.id} className={cn(r.outOfRange && 'bg-destructive/5')}>
              <TableCell className="whitespace-normal">
                {r.name}
                {r.referenceRange && <span className="block text-xs text-muted-foreground sm:hidden">Rif. {r.referenceRange}</span>}
              </TableCell>
              <TableCell className={cn('text-right font-medium tabular-nums', r.outOfRange && 'text-destructive')}>
                <span className="inline-flex items-center gap-1">
                  {r.outOfRange && <Icon className="size-3.5" aria-label="Fuori dai valori di riferimento" />}
                  {r.value}
                </span>
              </TableCell>
              <TableCell className="text-muted-foreground">{r.unit}</TableCell>
              <TableCell className="hidden text-muted-foreground tabular-nums sm:table-cell">{r.referenceRange}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
