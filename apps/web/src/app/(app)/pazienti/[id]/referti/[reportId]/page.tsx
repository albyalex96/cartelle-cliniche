import { getReport } from '@alby/core';
import { REPORT_KIND_LABELS, type ReportDTO } from '@alby/shared';
import { ArrowLeft, Info, Pencil } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { cache } from 'react';
import { Page, PageHeader } from '@/components/page';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DeleteReportButton } from '@/features/reports/delete-report-button';
import { LabResultsTable } from '@/features/reports/lab-results-table';
import { PdfPanel } from '@/features/reports/pdf-panel';
import { formatDate, formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { requirePageUser } from '@/server/context';
import { orNotFound } from '@/server/not-found';

type Props = { params: Promise<{ id: string; reportId: string }>; searchParams: Promise<{ duplicato?: string }> };

/** Una sola lettura (e una sola voce nel registro) per metadata e pagina. */
const loadReport = cache(async (patientId: string, reportId: string) => {
  const ctx = await requirePageUser();
  const report = await orNotFound(getReport(ctx, reportId));
  if (report.patientId !== patientId) notFound();
  return report;
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, reportId } = await params;
  return { title: (await loadReport(id, reportId)).title };
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  if (!children) return null;
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function Details({ report }: { report: ReportDTO }) {
  return (
    <Card>
      <CardContent>
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          <Detail label="Data dell’esame">{formatDate(report.examDate)}</Detail>
          <Detail label="Data del referto">{report.reportDate && formatDate(report.reportDate)}</Detail>
          <Detail label="Struttura">{report.facility}</Detail>
          <Detail label="Numero del referto">{report.reportNumber}</Detail>
          <Detail label="Medico">
            {report.doctor}
            {report.doctorRole && <span className="block text-muted-foreground">{report.doctorRole}</span>}
          </Detail>
        </dl>
      </CardContent>
    </Card>
  );
}

export default async function ReportPage({ params, searchParams }: Props) {
  const { id, reportId } = await params;
  const { duplicato } = await searchParams;
  const report = await loadReport(id, reportId);
  const isLab = report.kind === 'LABORATORIO';

  return (
    <Page className={cn(report.file && 'max-w-[96rem]')}>
      <Button variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground" asChild>
        <Link href={`/pazienti/${id}?tab=storico`}>
          <ArrowLeft />
          Storico del paziente
        </Link>
      </Button>

      <PageHeader
        title={report.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span>{formatDate(report.examDate)}</span>
            <Badge variant="secondary">{REPORT_KIND_LABELS[report.kind]}</Badge>
            {report.outOfRangeCount > 0 && (
              <Badge variant="outline" className="border-destructive/40 text-destructive">
                {report.outOfRangeCount} fuori range
              </Badge>
            )}
          </span>
        }
        actions={
          report.canEdit && (
            <>
              <Button variant="outline" asChild>
                <Link href={`/pazienti/${id}/referti/${report.id}/modifica`}>
                  <Pencil />
                  Modifica
                </Link>
              </Button>
              <DeleteReportButton reportId={report.id} hasFile={!!report.file} />
            </>
          )
        }
      />

      {duplicato && (
        <Alert>
          <Info />
          <AlertDescription>Questo PDF era già stato importato: ecco il referto salvato.</AlertDescription>
        </Alert>
      )}

      <div className={cn('grid items-start gap-6', report.file ? 'lg:grid-cols-2' : 'max-w-4xl')}>
        <div className="grid min-w-0 gap-4">
          <Details report={report} />

          {isLab && report.results.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Valori</CardTitle>
                <CardDescription>
                  {report.results.length} valori
                  {report.outOfRangeCount > 0 && `, ${report.outOfRangeCount} fuori dai valori di riferimento`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <LabResultsTable results={report.results} />
              </CardContent>
            </Card>
          )}

          {report.body && (
            <Card>
              <CardHeader>
                <CardTitle>{isLab ? 'Commento' : 'Testo del referto'}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{report.body}</p>
              </CardContent>
            </Card>
          )}

          {report.notes && (
            <Card>
              <CardHeader>
                <CardTitle>Note personali</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm">{report.notes}</p>
              </CardContent>
            </Card>
          )}

          <p className="text-xs text-muted-foreground">
            Inserito il {formatDateTime(report.createdAt)}
            {report.updatedAt !== report.createdAt && ` · modificato il ${formatDateTime(report.updatedAt)}`}
            {report.parserId && ' · dati letti automaticamente dal PDF'}
          </p>
        </div>
        {report.file && <PdfPanel file={report.file} className="order-first lg:order-last" />}
      </div>
    </Page>
  );
}
