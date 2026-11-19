import { getImagingStudy, getReport, listReportImagingStudies } from '@alby/core';
import {
  effectiveReportFields,
  isBlockReportField,
  REPORT_KIND_LABELS,
  reportFieldValue,
  SCAN_PARSER_ID,
  standardReportFieldDefs,
  type ReportCategory,
  type ReportDTO,
  type ReportField,
} from '@alby/shared';
import { ArrowLeft, FileDown, Info, Pencil } from 'lucide-react';
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
import { RichText } from '@/components/rich-text';
import { MODALITY_LABELS } from '@/features/imaging/modalities';
import { previewUrl } from '@/features/imaging/preview-url';
import { toViewerSeries } from '@/features/imaging/viewer-series';
import { DeleteReportButton } from '@/features/reports/delete-report-button';
import { LabResultsTable } from '@/features/reports/lab-results-table';
import { PdfPanel } from '@/features/reports/pdf-panel';
import { ReportImagesViewer } from '@/features/reports/report-images-viewer';
import { ReportViewerPanel } from '@/features/reports/report-viewer-panel';
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
  const studies = await listReportImagingStudies(ctx, reportId);
  // Le immagini collegate si guardano accanto al referto: servono le serie di ogni studio.
  const details = await Promise.all(studies.map((s) => getImagingStudy(ctx, s.id)));
  return { report, studies, details };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, reportId } = await params;
  return { title: (await loadReport(id, reportId)).report.title };
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

/** Valore di un campo breve, come va mostrato. */
function shownValue(f: ReportField, value: string) {
  if (f.type === 'date') return formatDate(value);
  if (f.type === 'checkbox') return value === 'true' ? 'Sì' : null;
  return value;
}

/** Campi brevi, con le etichette con cui il referto è stato salvato (`first`: voci da mettere prima). */
function DetailList({ report, fields, first }: { report: ReportDTO; fields: ReportField[]; first?: ReactNode }) {
  return (
    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
      {first}
      {fields.map((f) => (
        <Detail key={f.key} label={f.label}>
          {shownValue(f, reportFieldValue(f, report))}
        </Detail>
      ))}
    </dl>
  );
}

/** Contenuto di un campo in un riquadro: tabella dei valori o testo. */
function BlockValue({ report, field }: { report: ReportDTO; field: ReportField }) {
  if (field.type === 'lab_table') return <LabResultsTable results={report.results} />;
  const value = reportFieldValue(field, report);
  return field.type === 'rich_text' ? <RichText text={value} /> : <p className="whitespace-pre-wrap text-sm">{value}</p>;
}

/** Sotto il titolo della tabella dei valori: quanti sono e quanti fuori range. */
const resultsSummary = (report: ReportDTO) =>
  `${report.results.length} valori${report.outOfRangeCount > 0 ? `, ${report.outOfRangeCount} fuori dai valori di riferimento` : ''}`;

/** Un campo lungo (testo o tabella dei valori) nel suo riquadro. */
function BlockCard({ report, field }: { report: ReportDTO; field: ReportField }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{field.label}</CardTitle>
        {field.type === 'lab_table' && <CardDescription>{resultsSummary(report)}</CardDescription>}
      </CardHeader>
      <CardContent>
        <BlockValue report={report} field={field} />
      </CardContent>
    </Card>
  );
}

/** Una categoria del tipo di referto: i suoi campi insieme, in un solo riquadro. */
function CategoryCard({ report, category, fields }: { report: ReportDTO; category: ReportCategory; fields: ReportField[] }) {
  const inline = fields.filter((f) => !isBlockReportField(f));
  const blocks = fields.filter(isBlockReportField);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{category.name}</CardTitle>
        {category.description && <CardDescription>{category.description}</CardDescription>}
      </CardHeader>
      <CardContent className="grid gap-5">
        {inline.length > 0 && <DetailList report={report} fields={inline} />}
        {blocks.map((f) => (
          <section key={f.key} className="grid gap-2">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {f.label}
              {f.type === 'lab_table' && <span className="normal-case tracking-normal"> · {resultsSummary(report)}</span>}
            </h3>
            <BlockValue report={report} field={f} />
          </section>
        ))}
      </CardContent>
    </Card>
  );
}

export default async function ReportPage({ params, searchParams }: Props) {
  const { id, reportId } = await params;
  const { duplicato } = await searchParams;
  const { report, studies, details } = await loadReport(id, reportId);
  // I campi con cui il referto è stato salvato; quelli standard con un valore si mostrano comunque.
  const fields = effectiveReportFields(report.fields, standardReportFieldDefs(), report);
  const hasValue = (f: ReportField) => reportFieldValue(f, report) !== '';
  // Campi raggruppati per categoria (nell'ordine delle categorie); quelli senza restano come sono.
  const categoryKeys = new Set(report.categories.map((c) => c.key));
  const loose = fields.filter((f) => !categoryKeys.has(f.category));
  const groups = report.categories
    .map((category) => ({ category, fields: fields.filter((f) => f.category === category.key && (!isBlockReportField(f) || hasValue(f))) }))
    .filter((g) => g.fields.some(hasValue));
  const viewerStudies = details
    .map((d) => ({
      id: d.id,
      title: d.description || 'Studio senza descrizione',
      href: `/pazienti/${id}/immagini/${d.id}`,
      series: toViewerSeries(d),
    }))
    .filter((s) => s.series.length > 0);
  const hasViewer = !!report.file || viewerStudies.length > 0;

  return (
    <Page className={cn(hasViewer && 'max-w-[96rem]')}>
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
            <Badge variant="secondary">{report.templateName || REPORT_KIND_LABELS[report.kind]}</Badge>
            {report.outOfRangeCount > 0 && (
              <Badge variant="outline" className="border-destructive/40 text-destructive">
                {report.outOfRangeCount} fuori range
              </Badge>
            )}
          </span>
        }
        actions={
          <>
            <Button variant="outline" asChild>
              <a href={`/api/referti/${report.id}/pdf`} target="_blank" rel="noopener">
                <FileDown />
                Esporta PDF
              </a>
            </Button>
            {report.canEdit && (
              <>
                <Button variant="outline" asChild>
                  <Link href={`/pazienti/${id}/referti/${report.id}/modifica`}>
                    <Pencil />
                    Modifica
                  </Link>
                </Button>
                <DeleteReportButton reportId={report.id} hasFile={!!report.file} />
              </>
            )}
          </>
        }
      />

      {duplicato && (
        <Alert>
          <Info />
          <AlertDescription>Questo PDF era già stato importato: ecco il referto salvato.</AlertDescription>
        </Alert>
      )}

      <div className={cn('grid items-start gap-6', hasViewer ? 'lg:grid-cols-2' : 'max-w-4xl')}>
        <div className="grid min-w-0 gap-4">
          <Card>
            <CardContent>
              <DetailList
                report={report}
                fields={loose.filter((f) => !isBlockReportField(f))}
                first={<Detail label="Data dell’esame">{formatDate(report.examDate)}</Detail>}
              />
            </CardContent>
          </Card>

          {loose
            .filter((f) => isBlockReportField(f) && hasValue(f))
            .map((f) => (
              <BlockCard key={f.key} report={report} field={f} />
            ))}

          {groups.map((g) => (
            <CategoryCard key={g.category.key} report={report} category={g.category} fields={g.fields} />
          ))}

          {studies.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Immagini</CardTitle>
                <CardDescription>Le immagini dell’esame a cui si riferisce questo referto.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2">
                {studies.map((s) => (
                  <Link
                    key={s.id}
                    href={`/pazienti/${id}/immagini/${s.id}`}
                    className="flex items-center gap-3 rounded-lg border p-2 transition-colors hover:bg-muted/50"
                  >
                    <span className="block size-14 shrink-0 overflow-hidden rounded-md bg-black">
                      {s.coverInstanceId && (
                        <img src={previewUrl(s.coverInstanceId, 'thumb')} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
                      )}
                    </span>
                    <span className="grid min-w-0 gap-0.5">
                      <span className="truncate text-sm font-medium">{s.description || 'Studio senza descrizione'}</span>
                      <span className="text-xs text-muted-foreground">
                        {[s.studyDate && formatDate(s.studyDate), s.modalities.map((m) => MODALITY_LABELS[m] ?? m).join(', '), s.imageCount === 1 ? '1 immagine' : `${s.imageCount} immagini`]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                  </Link>
                ))}
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
            {report.parserId &&
              (report.parserId === SCAN_PARSER_ID
                ? ' · dati letti automaticamente da una scansione (OCR)'
                : ' · dati letti automaticamente dal PDF')}
          </p>
        </div>
        {hasViewer && (
          <ReportViewerPanel
            className="order-first lg:order-last"
            pdf={report.file && <PdfPanel file={report.file} />}
            images={viewerStudies.length > 0 && <ReportImagesViewer studies={viewerStudies} report={report.body ? { title: report.title, body: report.body } : null} />}
          />
        )}
      </div>
    </Page>
  );
}
