import { getPatient, getReport, getReportDocument, listImagingStudies } from '@alby/core';
import type { ReportDraftDTO, ReportDTO } from '@alby/shared';
import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Page, PageHeader } from '@/components/page';
import { Button } from '@/components/ui/button';
import { DocumentPane } from '@/features/reports/document-pane';
import { ReportForm } from '@/features/reports/report-form';
import { toReportImaging } from '@/features/reports/report-imaging';
import { ScanBridgeProvider } from '@/features/reports/scan-bridge';
import { cn } from '@/lib/utils';
import { requirePageUser } from '@/server/context';
import { orNotFound } from '@/server/not-found';

type Props = { params: Promise<{ id: string; reportId: string }> };

export const metadata: Metadata = { title: 'Modifica referto' };

/** Referto salvato → valori del form (stringhe vuote per i campi mancanti). */
function toFormValues(r: ReportDTO): ReportDraftDTO['values'] {
  return {
    kind: r.kind,
    title: r.title,
    examDate: r.examDate,
    samplingDate: r.samplingDate ?? '',
    reportDate: r.reportDate ?? '',
    reportNumber: r.reportNumber ?? '',
    facility: r.facility ?? '',
    doctor: r.doctor ?? '',
    doctorRole: r.doctorRole ?? '',
    body: r.body ?? '',
    notes: r.notes ?? '',
    results: r.results.map((x) => ({
      section: x.section ?? '',
      name: x.name,
      value: x.value,
      unit: x.unit ?? '',
      referenceRange: x.referenceRange ?? '',
      outOfRange: x.outOfRange,
    })),
  };
}

export default async function EditReportPage({ params }: Props) {
  const ctx = await requirePageUser();
  const { id, reportId } = await params;
  const report = await orNotFound(getReport(ctx, reportId));
  if (report.patientId !== id || !report.canEdit) notFound();
  const back = `/pazienti/${id}/referti/${report.id}`;
  const [patient, studies, doc] = await Promise.all([
    orNotFound(getPatient(ctx, id)),
    listImagingStudies(ctx, id),
    report.file ? getReportDocument(ctx, report.file.id) : null,
  ]);
  const imaging = toReportImaging(patient, studies, report.id);

  return (
    <Page className={cn(report.file && 'max-w-[96rem]')}>
      <Button variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground" asChild>
        <Link href={back}>
          <ArrowLeft />
          {report.title}
        </Link>
      </Button>
      <PageHeader title="Modifica referto" />
      {/* Come nel modal "Nuovo referto": bottoni per leggere (OCR) o ritagliare le zone del PDF accanto al form. */}
      <ScanBridgeProvider>
        <div className={cn('grid items-start gap-6', report.file ? 'lg:grid-cols-2' : 'max-w-3xl')}>
          <div className="min-w-0">
            <ReportForm mode={{ type: 'edit', reportId: report.id, cancelHref: back }} initial={toFormValues(report)} imaging={imaging} />
          </div>
          {report.file && doc && <DocumentPane file={report.file} doc={doc} className="order-first lg:order-last" />}
        </div>
      </ScanBridgeProvider>
    </Page>
  );
}
