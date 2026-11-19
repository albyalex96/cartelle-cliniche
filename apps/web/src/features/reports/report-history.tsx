import { REPORT_KIND_LABELS, type ImagingStudyDTO, type ReportSummaryDTO, type ReportTemplateDTO } from '@alby/shared';
import { CircleCheck, Download, FileDown, FileText, FlaskConical, History, Images, MapPin, Paperclip, Pencil, Stethoscope, TriangleAlert, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from 'cn';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { DiscPatient } from '@/features/imaging/disc-import-dialog';
import { TemplateIcon } from '@/features/report-templates/template-icon';
import { DeleteReportButton } from './delete-report-button';
import { NewReportMenu } from './new-report-menu';
import type { ReportImaging } from './report-imaging';

/** Pulsante-icona con suggerimento: un link interno, un link esterno (PDF) o un download. */
function ActionLink({ href, label, icon: Icon, newTab, download }: { href: string; label: string; icon: LucideIcon; newTab?: boolean; download?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-foreground" asChild>
          {newTab || download ? (
            <a href={href} aria-label={label} {...(newTab ? { target: '_blank', rel: 'noopener' } : {})} {...(download ? { download: '' } : {})}>
              <Icon />
            </a>
          ) : (
            <Link href={href} aria-label={label}>
              <Icon />
            </Link>
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

const DAY = new Intl.DateTimeFormat('it-IT', { day: 'numeric', timeZone: 'UTC' });
const MONTH = new Intl.DateTimeFormat('it-IT', { month: 'short', timeZone: 'UTC' });
const FULL = new Intl.DateTimeFormat('it-IT', { dateStyle: 'full', timeZone: 'UTC' });

/** Pastiglia di stato o di allegato, con icona; con `href` è un link. */
function Chip({
  icon: Icon,
  children,
  tone = 'neutral',
  href,
  newTab,
  title,
}: {
  icon: LucideIcon;
  children: ReactNode;
  tone?: 'neutral' | 'danger' | 'success' | 'primary';
  href?: string | null;
  newTab?: boolean;
  title?: string;
}) {
  const className = cn(
    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
    tone === 'danger' && 'border-destructive/25 bg-destructive/10 text-destructive',
    tone === 'success' && 'border-emerald-600/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    tone === 'primary' && 'border-primary/20 bg-primary/10 text-primary',
    tone === 'neutral' && 'bg-muted/60 text-muted-foreground',
    href && 'hover:border-foreground/25 hover:text-foreground',
  );
  const content = (
    <>
      <Icon className="size-3.5" />
      {children}
    </>
  );
  if (!href)
    return (
      <span className={className} title={title}>
        {content}
      </span>
    );
  return newTab ? (
    <a href={href} target="_blank" rel="noopener" className={className} title={title}>
      {content}
    </a>
  ) : (
    <Link href={href} className={className} title={title}>
      {content}
    </Link>
  );
}

/**
 * Un referto dello storico: riquadro con la data, tipo e titolo, struttura e medico, stato dei valori
 * (con una barra che mostra la quota fuori range), allegati e azioni. Tutta la card apre il referto.
 */
function ReportCard({ report: r, patientId, linkedStudies, canEdit }: { report: ReportSummaryDTO; patientId: string; linkedStudies: string[]; canEdit: boolean }) {
  const page = `/pazienti/${patientId}/referti/${r.id}`;
  // Un solo studio collegato: si apre direttamente; più studi: la pagina del referto li mostra tutti.
  const imagesHref = linkedStudies.length === 1 ? `/pazienti/${patientId}/immagini/${linkedStudies[0]}` : linkedStudies.length > 1 ? page : null;
  const date = new Date(`${r.examDate}T00:00:00Z`);
  const flagged = r.outOfRangeCount > 0;
  const outShare = r.resultCount ? Math.max(4, Math.round((r.outOfRangeCount / r.resultCount) * 100)) : 0;

  return (
    <article
      className={cn(
        'group/card relative flex flex-col gap-4 overflow-hidden rounded-xl border bg-card p-4 pl-5 shadow-xs transition-all hover:border-primary/30 hover:shadow-md sm:flex-row sm:items-start',
        flagged ? 'border-l-destructive/70' : 'border-l-primary/50',
        'border-l-4',
      )}
    >
      <time
        dateTime={r.examDate}
        title={FULL.format(date)}
        className="flex w-16 shrink-0 flex-row items-baseline gap-1.5 sm:flex-col sm:items-center sm:gap-0 sm:rounded-lg sm:border sm:bg-muted/40 sm:py-2"
      >
        <span className="text-2xl leading-none font-semibold tabular-nums">{DAY.format(date)}</span>
        <span className="text-xs font-medium tracking-widest text-muted-foreground uppercase sm:mt-1">{MONTH.format(date).replace('.', '')}</span>
        <span className="text-[11px] text-muted-foreground tabular-nums">{r.examDate.slice(0, 4)}</span>
      </time>

      <div className="grid min-w-0 flex-1 gap-2">
        <div className="flex items-center gap-2 text-[11px] font-semibold tracking-wider text-primary uppercase">
          <span className="flex size-6 items-center justify-center rounded-md bg-primary/10">
            <TemplateIcon icon={r.templateIcon} className="size-3.5" />
          </span>
          <span className="truncate">{r.templateName || REPORT_KIND_LABELS[r.kind]}</span>
        </div>

        {/* Il link si estende a tutta la card; chip e azioni stanno sopra (z-10) e restano cliccabili. */}
        <Link href={page} className="text-base leading-snug font-semibold text-balance underline-offset-4 after:absolute after:inset-0 hover:underline">
          {r.title}
        </Link>

        {(r.facility || r.doctor) && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {r.facility && (
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <MapPin className="size-3.5 shrink-0" />
                <span className="truncate">{r.facility}</span>
              </span>
            )}
            {r.doctor && (
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <Stethoscope className="size-3.5 shrink-0" />
                <span className="truncate">{r.doctor}</span>
              </span>
            )}
          </div>
        )}

        <div className="relative z-10 flex flex-wrap items-center gap-1.5 pt-1">
          {r.resultCount > 0 && (
            <Chip icon={FlaskConical} tone="primary">
              {r.resultCount === 1 ? '1 valore' : `${r.resultCount} valori`}
            </Chip>
          )}
          {flagged ? (
            <Chip icon={TriangleAlert} tone="danger">
              {r.outOfRangeCount} fuori range
            </Chip>
          ) : (
            r.resultCount > 0 && (
              <Chip icon={CircleCheck} tone="success">
                Tutti nella norma
              </Chip>
            )
          )}
          {r.fileId && (
            <Chip icon={Paperclip} href={`/api/files/${r.fileId}`} newTab title="Apri il documento originale">
              Originale
            </Chip>
          )}
          {imagesHref && (
            <Chip icon={Images} href={imagesHref} title={linkedStudies.length > 1 ? `${linkedStudies.length} studi collegati` : 'Apri le immagini'}>
              {linkedStudies.length > 1 ? `Immagini (${linkedStudies.length})` : 'Immagini'}
            </Chip>
          )}
        </div>

        {r.resultCount > 0 && (
          <div
            className="mt-1 h-1 w-full max-w-xs overflow-hidden rounded-full bg-emerald-500/25"
            role="img"
            aria-label={`${r.resultCount - r.outOfRangeCount} valori nella norma su ${r.resultCount}`}
          >
            {flagged && <div className="ml-auto h-full rounded-full bg-destructive/80" style={{ width: `${outShare}%` }} />}
          </div>
        )}
      </div>

      <div className="relative z-10 flex shrink-0 gap-0.5 self-end opacity-80 transition-opacity group-hover/card:opacity-100 sm:self-start">
        <ActionLink href={`/api/referti/${r.id}/pdf`} label="Esporta in PDF" icon={FileDown} newTab />
        {r.fileId && (
          <>
            <ActionLink href={`/api/files/${r.fileId}`} label="Vedi documento originale" icon={FileText} newTab />
            <ActionLink href={`/api/files/${r.fileId}?download=1`} label="Scarica documento originale" icon={Download} download />
          </>
        )}
        {canEdit && (
          <>
            <ActionLink href={`${page}/modifica`} label="Modifica dati" icon={Pencil} />
            <DeleteReportButton reportId={r.id} hasFile={r.hasFile} compact />
          </>
        )}
      </div>
    </article>
  );
}

/**
 * Storico dei referti del paziente, dal più recente, raggruppato per anno (Server Component).
 * Per ogni referto: apri, esporta in PDF, vedi o scarica il documento originale, modifica, elimina.
 */
export function ReportHistory({
  patient,
  reports,
  studies,
  canEdit,
  imaging,
  templates,
}: {
  patient: DiscPatient;
  reports: ReportSummaryDTO[];
  /** Studi di immagini del paziente: per segnare i referti che ne hanno di collegati. */
  studies: ImagingStudyDTO[];
  canEdit: boolean;
  imaging: ReportImaging;
  /** Tipi di referto, per il bottone + (vuoto se l'utente non può inserire referti). */
  templates: ReportTemplateDTO[];
}) {
  const patientId = patient.id;
  if (reports.length === 0) {
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <History />
          </EmptyMedia>
          <EmptyTitle>Storico vuoto</EmptyTitle>
          <EmptyDescription>
            {canEdit
              ? 'Con il bottone + inserisci un referto: puoi compilarlo a mano o caricarne il PDF, che viene letto in automatico e resta salvato così com’è.'
              : 'Per questo paziente non sono ancora stati inseriti referti.'}
          </EmptyDescription>
        </EmptyHeader>
        {canEdit && (
          <EmptyContent className="flex-row flex-wrap justify-center">
            <NewReportMenu imaging={imaging} templates={templates} />
          </EmptyContent>
        )}
      </Empty>
    );
  }

  // Raggruppati per anno, dal più recente (l'ordine arriva già dal server).
  const years: { year: string; items: ReportSummaryDTO[] }[] = [];
  for (const r of reports) {
    const year = r.examDate.slice(0, 4);
    if (years.at(-1)?.year !== year) years.push({ year, items: [] });
    years.at(-1)!.items.push(r);
  }

  return (
    <div className="grid gap-6">
      <p className="text-sm text-muted-foreground">
        {reports.length === 1 ? '1 referto' : `${reports.length} referti`}, dal più recente
      </p>

      {years.map(({ year, items }) => (
        <section key={year} className="grid gap-3" aria-label={`Referti del ${year}`}>
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold tabular-nums tracking-wide">{year}</h3>
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">{items.length === 1 ? '1 referto' : `${items.length} referti`}</span>
          </div>
          <ul className="grid gap-3">
            {items.map((r) => {
              const linked = studies.filter((s) => s.reportId === r.id);
              return (
                <li key={r.id}>
                  <ReportCard report={r} patientId={patientId} linkedStudies={linked.map((s) => s.id)} canEdit={canEdit} />
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
