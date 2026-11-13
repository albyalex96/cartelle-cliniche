import { REPORT_KIND_LABELS, type ReportSummaryDTO } from '@alby/shared';
import { Download, Eye, FileText, FlaskConical, History, Pencil, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatDate } from '@/lib/format';
import type { DiscPatient } from '@/features/imaging/disc-import-dialog';
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

/**
 * Storico dei referti del paziente, dal più recente (Server Component).
 * Per ogni referto: apri, vedi o scarica il PDF originale, modifica, elimina.
 */
export function ReportHistory({
  patient,
  reports,
  canEdit,
  imaging,
}: {
  patient: DiscPatient;
  reports: ReportSummaryDTO[];
  canEdit: boolean;
  imaging: ReportImaging;
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
            <NewReportMenu imaging={imaging} />
          </EmptyContent>
        )}
      </Empty>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {reports.length === 1 ? '1 referto' : `${reports.length} referti`}, dal più recente
        </p>
        {canEdit && (
          <NewReportMenu imaging={imaging} />
        )}
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-28 pl-4">Data esame</TableHead>
              <TableHead>Esame</TableHead>
              <TableHead className="hidden md:table-cell">Esito</TableHead>
              <TableHead className="pr-4 text-right">Azioni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reports.map((r) => {
              const page = `/pazienti/${patientId}/referti/${r.id}`;
              const Icon = r.kind === 'LABORATORIO' ? FlaskConical : FileText;
              return (
                <TableRow key={r.id}>
                  <TableCell className="pl-4 align-top tabular-nums">{formatDate(r.examDate)}</TableCell>
                  <TableCell className="whitespace-normal">
                    <Link href={page} className="group flex min-w-0 items-start gap-3">
                      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Icon className="size-4" />
                      </span>
                      <span className="grid min-w-0 gap-0.5">
                        <span className="font-medium underline-offset-4 group-hover:underline">{r.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {REPORT_KIND_LABELS[r.kind]}
                          {r.facility && ` · ${r.facility}`}
                        </span>
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell className="hidden align-top md:table-cell">
                    <span className="flex flex-wrap gap-1.5">
                      {r.resultCount > 0 && <Badge variant="secondary">{r.resultCount} valori</Badge>}
                      {r.outOfRangeCount > 0 && (
                        <Badge variant="outline" className="border-destructive/40 text-destructive">
                          {r.outOfRangeCount} fuori range
                        </Badge>
                      )}
                      {r.resultCount === 0 && <span className="text-sm text-muted-foreground">—</span>}
                    </span>
                  </TableCell>
                  <TableCell className="pr-4 align-top">
                    <div className="flex justify-end gap-0.5">
                      <ActionLink href={page} label="Apri referto" icon={Eye} />
                      {r.fileId && (
                        <>
                          <ActionLink href={`/api/files/${r.fileId}`} label="Vedi PDF originale" icon={FileText} newTab />
                          <ActionLink href={`/api/files/${r.fileId}?download=1`} label="Scarica PDF" icon={Download} download />
                        </>
                      )}
                      {canEdit && (
                        <>
                          <ActionLink href={`${page}/modifica`} label="Modifica dati" icon={Pencil} />
                          <DeleteReportButton reportId={r.id} hasFile={r.hasFile} compact />
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
