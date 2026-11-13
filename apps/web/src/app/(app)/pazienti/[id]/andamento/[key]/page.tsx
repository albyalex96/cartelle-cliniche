import { getLabTrend, getPatient } from '@alby/core';
import { ArrowLeft, CircleAlert, FileText } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { cache } from 'react';
import { Page, PageHeader } from '@/components/page';
import { Unit } from '@/components/unit';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TrendChart } from '@/features/trends/trend-chart';
import { formatDate } from '@/lib/format';
import { requirePageUser } from '@/server/context';
import { orNotFound } from '@/server/not-found';

type Props = { params: Promise<{ id: string; key: string }> };

/** Una sola lettura (e una sola voce nel registro) per metadata e pagina. */
const load = cache(async (patientId: string, key: string) => {
  const ctx = await requirePageUser();
  const [patient, trends] = await Promise.all([orNotFound(getPatient(ctx, patientId)), orNotFound(getLabTrend(ctx, patientId, decodeURIComponent(key)))]);
  return { patient, trends };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, key } = await params;
  const { trends } = await load(id, key);
  return { title: `Andamento: ${trends[0]!.label}` };
}

export default async function LabTrendPage({ params }: Props) {
  const { id, key } = await params;
  const { patient, trends } = await load(id, key);
  const main = trends[0]!;
  const names = [...new Set(trends.flatMap((t) => t.points.map((p) => p.name)))];

  return (
    <Page>
      <Button variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground" asChild>
        <Link href={`/pazienti/${patient.id}?tab=andamento`}>
          <ArrowLeft />
          {patient.firstName} {patient.lastName}
        </Link>
      </Button>

      <PageHeader
        title={main.label}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span>{main.category}</span>
            {names.length > 1 && <span className="text-muted-foreground">· nei referti anche come {names.filter((n) => n !== main.label).join(', ')}</span>}
          </span>
        }
      />

      {trends.map((trend) => {
        const rows = [...trend.points].reverse();
        return (
          <Card key={trend.unit ?? ''}>
            {trends.length > 1 && (
              <CardHeader>
                <CardTitle>{trend.unit ? <>Valori in <Unit value={trend.unit} /></> : 'Valori senza unità di misura'}</CardTitle>
              </CardHeader>
            )}
            <CardContent className="grid gap-6">
              {trend.numericCount >= 2 ? (
                <TrendChart trend={trend} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {trend.numericCount === 1 ? 'Per il grafico servono almeno due valori numerici.' : 'I valori di questo esame non sono numeri: non c’è un grafico.'}
                </p>
              )}
              <div className="overflow-hidden rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="pl-4">Data</TableHead>
                      <TableHead>Valore</TableHead>
                      <TableHead className="hidden sm:table-cell">Riferimento</TableHead>
                      <TableHead className="pr-4">Referto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((p, i) => (
                      <TableRow key={`${p.reportId}-${i}`}>
                        <TableCell className="pl-4 tabular-nums">{formatDate(p.date)}</TableCell>
                        <TableCell className="whitespace-normal">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="font-medium tabular-nums">
                              {p.value}
                              {trend.unit && <span className="ml-1 font-normal text-muted-foreground"><Unit value={trend.unit} /></span>}
                            </span>
                            {p.outOfRange && (
                              <Badge variant="destructive" className="h-5 gap-1 px-1.5 text-[11px]">
                                <CircleAlert className="size-3" />
                                Fuori intervallo
                              </Badge>
                            )}
                          </span>
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground tabular-nums sm:table-cell">{p.referenceRange ?? '—'}</TableCell>
                        <TableCell className="pr-4 whitespace-normal">
                          <Link
                            href={`/pazienti/${patient.id}/referti/${p.reportId}`}
                            className="inline-flex items-center gap-1.5 text-sm underline-offset-4 hover:underline"
                          >
                            <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                            {p.reportTitle}
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        );
      })}

      <p className="text-xs text-muted-foreground">
        I valori sono quelli inseriti dai referti. Laboratori diversi possono usare metodi e intervalli di riferimento diversi: per interpretarli rivolgiti al medico.
      </p>
    </Page>
  );
}
