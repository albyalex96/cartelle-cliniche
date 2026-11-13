import { getImagingStudy, listReports } from '@alby/core';
import { ArrowLeft, FileText } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { Page, PageHeader } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RichText } from '@/components/rich-text';
import { MODALITY_LABELS } from '@/features/imaging/modalities';
import { ReportLinkSelect } from '@/features/imaging/report-link-select';
import { StudyViewer } from '@/features/imaging/study-viewer';
import { toViewerSeries } from '@/features/imaging/viewer-series';
import { formatDate } from '@/lib/format';
import { requirePageUser } from '@/server/context';
import { orNotFound } from '@/server/not-found';

type Props = { params: Promise<{ id: string; studyId: string }> };

/** Una sola lettura (e una sola voce nel registro) per metadata e pagina. */
const loadStudy = cache(async (patientId: string, studyId: string) => {
  const ctx = await requirePageUser();
  const study = await orNotFound(getImagingStudy(ctx, studyId));
  if (study.patientId !== patientId) notFound();
  // I referti tra cui scegliere servono solo a chi può modificare il collegamento.
  const reports = study.canEdit ? await listReports(ctx, patientId) : [];
  return { study, reports };
});

const titleOf = (description: string | null) => description || 'Studio senza descrizione';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, studyId } = await params;
  return { title: titleOf((await loadStudy(id, studyId)).study.description) };
}

export default async function ImagingStudyPage({ params }: Props) {
  const { id, studyId } = await params;
  const { study, reports } = await loadStudy(id, studyId);
  const { report } = study;
  const series = toViewerSeries(study);

  return (
    <Page>
      <Button variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground" asChild>
        <Link href={`/pazienti/${id}?tab=imaging`}>
          <ArrowLeft />
          Immagini del paziente
        </Link>
      </Button>

      <PageHeader
        title={titleOf(study.description)}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {study.studyDate && <span>{formatDate(study.studyDate)}</span>}
            {study.modalities.map((m) => (
              <Badge key={m} variant="secondary" title={m}>
                {MODALITY_LABELS[m] ?? m}
              </Badge>
            ))}
            {study.institution && <span>{study.institution}</span>}
          </span>
        }
      />

      {(report || study.canEdit) && (
        <Card>
          <CardHeader>
            <CardTitle>Referto</CardTitle>
            <CardDescription>
              {report ? 'La versione testuale di questo esame. Il testo resta visibile anche mentre scorri le immagini.' : 'Collega il referto testuale di questo esame per leggerlo accanto alle immagini.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {study.canEdit &&
              (reports.length > 0 ? (
                <ReportLinkSelect
                  studyId={study.id}
                  reportId={report?.id ?? null}
                  reports={reports.map((r) => ({ id: r.id, label: `${formatDate(r.examDate)} · ${r.title}` }))}
                />
              ) : (
                <p className="text-sm text-muted-foreground">Questo paziente non ha ancora referti: inseriscine uno dallo storico per poterlo collegare.</p>
              ))}
            {report && (
              <div className="grid gap-2">
                <Button variant="link" className="h-auto w-fit p-0" asChild>
                  <Link href={`/pazienti/${id}/referti/${report.id}`}>
                    <FileText />
                    {report.title} · {formatDate(report.examDate)}
                  </Link>
                </Button>
                {report.body && <RichText text={report.body} className="max-h-72 overflow-y-auto" />}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {series.length === 0 && <p className="text-sm text-muted-foreground">Questo studio non contiene immagini.</p>}

      <StudyViewer series={series} report={report?.body ? { title: report.title, body: report.body } : null} />
    </Page>
  );
}
