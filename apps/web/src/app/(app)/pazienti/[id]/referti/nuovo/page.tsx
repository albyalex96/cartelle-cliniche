import { AppError, getPatient, prepareReportDraft } from '@alby/core';
import type { ReportDraftDTO } from '@alby/shared';
import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Page, PageHeader } from '@/components/page';
import { Button } from '@/components/ui/button';
import { DraftNotices } from '@/features/reports/draft-notices';
import { PdfPanel } from '@/features/reports/pdf-panel';
import { ReportForm } from '@/features/reports/report-form';
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
          draft.file
            ? `Dati letti dal PDF per ${patient.firstName} ${patient.lastName}: controllali confrontandoli con il documento e salva.`
            : `Inserimento a mano per ${patient.firstName} ${patient.lastName}.`
        }
      />
      <div className={cn('grid items-start gap-6', draft.file ? 'lg:grid-cols-2' : 'max-w-3xl')}>
        <div className="grid min-w-0 gap-4">
          <DraftNotices draft={draft} />
          <ReportForm
            mode={{ type: 'create', patientId: id, fileId: draft.file?.id ?? null, parser: draft.parser, cancelHref: back }}
            initial={draft.values}
          />
        </div>
        {/* Sul telefono il link al PDF sta in alto; da computer il documento è a destra. */}
        {draft.file && <PdfPanel file={draft.file} className="order-first lg:order-last" />}
      </div>
    </Page>
  );
}
