import { AppError, getPatient, listImagingStudies, prepareReportDraft } from '@alby/core';
import type { ReportDraftDTO } from '@alby/shared';
import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Page, PageHeader } from '@/components/page';
import { Button } from '@/components/ui/button';
import { DraftNotices } from '@/features/reports/draft-notices';
import { DocumentPane } from '@/features/reports/document-pane';
import { ReportForm } from '@/features/reports/report-form';
import { ScanBridgeProvider } from '@/features/reports/scan-bridge';
import { toReportImaging } from '@/features/reports/report-imaging';
import { requirePageUser } from '@/server/context';
import { orNotFound } from '@/server/not-found';
import { cn } from '@/lib/utils';

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ file?: string }> };

export const metadata: Metadata = { title: 'Nuovo referto' };

/**
 * Nuovo referto: vuoto (inserimento a mano) oppure precompilato dal PDF appena caricato,
 * con il documento originale a destra per il confronto. Nulla è salvato finché non si conferma.
 */
export default async function NewReportPage({ params, searchParams }: Props) {
  const ctx = await requirePageUser();
  const { id } = await params;
  const { file } = await searchParams;
  const patient = await orNotFound(getPatient(ctx, id));
  if (!patient.canEdit) notFound();

  const back = `/pazienti/${id}?tab=storico`;
  let draft: ReportDraftDTO;
  try {
    draft = await orNotFound(prepareReportDraft(ctx, id, file));
  } catch (err) {
    // PDF già importato (es. pagina ricaricata dopo il salvataggio): si torna all'elenco.
    if (err instanceof AppError && err.code === 'ALREADY_IMPORTED') redirect(back);
    throw err;
  }

  const imaging = toReportImaging(patient, await listImagingStudies(ctx, id), null);

  return (
    <Page className={cn(draft.file && 'max-w-[96rem]')}>
      <Button variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground" asChild>
        <Link href={back}>
          <ArrowLeft />
          {patient.firstName} {patient.lastName}
        </Link>
      </Button>
      <PageHeader
        title={draft.file ? 'Revisione del referto' : 'Nuovo referto'}
        description={
          draft.scan
            ? `PDF scansionato per ${patient.firstName} ${patient.lastName}: seleziona sul documento le zone da leggere, controlla i dati e salva.`
            : draft.file
              ? `Dati letti dal PDF per ${patient.firstName} ${patient.lastName}: controllali confrontandoli con il documento e salva.`
              : `Inserimento a mano per ${patient.firstName} ${patient.lastName}.`
        }
      />
      {/* Per le scansioni il form riceve il testo delle zone selezionate sul documento (ScanBridgeProvider). */}
      <ScanBridgeProvider>
        <div className={cn('grid items-start gap-6', draft.file ? 'lg:grid-cols-2' : 'max-w-3xl')}>
          <div className="grid min-w-0 gap-4">
            <DraftNotices draft={draft} />
            <ReportForm
              mode={{ type: 'create', patientId: id, fileId: draft.file?.id ?? null, parser: draft.parser, cancelHref: back }}
              initial={draft.values}
              imaging={imaging}
            />
          </div>
          {/* Sul telefono il link al PDF sta in alto; da computer il documento è a destra. */}
          {draft.file && <DocumentPane file={draft.file} doc={draft}className="order-first lg:order-last" />}
        </div>
      </ScanBridgeProvider>
    </Page>
  );
}
