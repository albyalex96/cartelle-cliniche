import type { LabTrendDTO } from '@alby/shared';
import { ChevronRight, CircleAlert, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDate } from '@/lib/format';
import { Sparkline } from './sparkline';

export const trendHref = (patientId: string, key: string) => `/pazienti/${patientId}/andamento/${encodeURIComponent(key)}`;

/** Elenco degli esami del paziente con l'ultimo valore e un mini-grafico, divisi per categoria (Server Component). */
export function LabTrends({ patientId, trends }: { patientId: string; trends: LabTrendDTO[] }) {
  if (trends.length === 0) {
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <TrendingUp />
          </EmptyMedia>
          <EmptyTitle>Nessun valore da confrontare</EmptyTitle>
          <EmptyDescription>
            Quando inserisci i referti degli esami di laboratorio, qui vedrai come cambiano nel tempo i valori (emoglobina, glicemia, colesterolo…).
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const categories = [...new Set(trends.map((t) => t.category))];
  const repeated = trends.filter((t) => t.numericCount >= 2).length;

  return (
    <div className="grid gap-6">
      <p className="text-sm text-muted-foreground">
        {trends.length === 1 ? '1 esame' : `${trends.length} esami`}
        {repeated > 0 && ` · ${repeated} con almeno due valori da confrontare`}. Gli esami con nomi diversi nei vari referti (per esempio “HGB” ed “Emoglobina”) sono
        riuniti.
      </p>
      {categories.map((category) => (
        <section key={category} className="grid gap-2">
          <h2 className="font-medium">{category}</h2>
          <div className="overflow-hidden rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4">Esame</TableHead>
                  <TableHead>Ultimo valore</TableHead>
                  <TableHead className="hidden sm:table-cell">Andamento</TableHead>
                  <TableHead className="hidden w-24 text-right md:table-cell">Valori</TableHead>
                  <TableHead className="w-10 pr-4" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {trends
                  .filter((t) => t.category === category)
                  .map((t) => {
                    const last = t.points.at(-1)!;
                    const href = trendHref(patientId, t.key);
                    return (
                      <TableRow key={`${t.key}|${t.unit ?? ''}`} className="relative">
                        <TableCell className="pl-4 whitespace-normal">
                          {/* Tutta la riga è cliccabile: il link si estende sull'intera riga. */}
                          <Link href={href} className="font-medium after:absolute after:inset-0 focus-visible:outline-none">
                            {t.label}
                          </Link>
                          {t.unit && <span className="ml-1.5 text-xs text-muted-foreground">{t.unit}</span>}
                        </TableCell>
                        <TableCell className="whitespace-normal">
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span className="tabular-nums">{last.value}</span>
                            {last.outOfRange && (
                              <Badge variant="destructive" className="h-5 gap-1 px-1.5 text-[11px]">
                                <CircleAlert className="size-3" />
                                Fuori intervallo
                              </Badge>
                            )}
                            <span className="text-xs text-muted-foreground tabular-nums">{formatDate(last.date)}</span>
                          </span>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <Sparkline trend={t} />
                        </TableCell>
                        <TableCell className="hidden text-right text-muted-foreground tabular-nums md:table-cell">{t.points.length}</TableCell>
                        <TableCell className="pr-4 text-muted-foreground">
                          <ChevronRight className="size-4" />
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          </div>
        </section>
      ))}
    </div>
  );
}
