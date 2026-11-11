import type { ImagingStudyDTO } from '@alby/shared';
import { ScanLine } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDate } from '@/lib/format';
import { DeleteStudyButton } from './delete-study-button';
import { DiscImportDialog, type DiscPatient } from './disc-import-dialog';
import { MODALITY_LABELS } from './modalities';

const size = (bytes: number) =>
  bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toLocaleString('it-IT', { maximumFractionDigits: 1 })} GB` : `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;

/** Studi di immagini salvati per il paziente (Server Component). */
export function ImagingStudies({ patient, studies, canEdit }: { patient: DiscPatient; studies: ImagingStudyDTO[]; canEdit: boolean }) {
  if (studies.length === 0) {
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ScanLine />
          </EmptyMedia>
          <EmptyTitle>Nessuna immagine</EmptyTitle>
          <EmptyDescription>
            {canEdit
              ? 'Leggi il CD/DVD di ecografie, TAC e risonanze: vengono salvate solo le immagini, così come sono. Il visualizzatore integrato è in arrivo.'
              : 'Per questo paziente non sono ancora state caricate immagini.'}
          </EmptyDescription>
        </EmptyHeader>
        {canEdit && (
          <EmptyContent>
            <DiscImportDialog patient={patient} canEdit variant="default" />
          </EmptyContent>
        )}
      </Empty>
    );
  }

  const total = studies.reduce((n, s) => n + s.bytes, 0);
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {studies.length === 1 ? '1 studio' : `${studies.length} studi`} · {size(total)}
        </p>
        {canEdit && <DiscImportDialog patient={patient} canEdit />}
      </div>
      <div className="overflow-hidden rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-28 pl-4">Data esame</TableHead>
              <TableHead>Studio</TableHead>
              <TableHead className="hidden sm:table-cell">Immagini</TableHead>
              <TableHead className="pr-4 text-right">Azioni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {studies.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="pl-4 align-top tabular-nums">{s.studyDate ? formatDate(s.studyDate) : '—'}</TableCell>
                <TableCell className="whitespace-normal">
                  <span className="grid gap-1">
                    <span className="font-medium">{s.description || 'Studio senza descrizione'}</span>
                    <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      {s.modalities.map((m) => (
                        <Badge key={m} variant="secondary" title={m}>
                          {MODALITY_LABELS[m] ?? m}
                        </Badge>
                      ))}
                      {s.institution}
                    </span>
                  </span>
                </TableCell>
                <TableCell className="hidden align-top text-sm text-muted-foreground sm:table-cell">
                  {s.seriesCount === 1 ? '1 serie' : `${s.seriesCount} serie`} · {s.imageCount} immagini · {size(s.bytes)}
                </TableCell>
                <TableCell className="pr-4 align-top">
                  <div className="flex items-center justify-end gap-1.5">
                    <Badge variant="outline" title="Il visualizzatore DICOM è il prossimo passo">
                      Visualizzatore in arrivo
                    </Badge>
                    {canEdit && <DeleteStudyButton studyId={s.id} imageCount={s.imageCount} />}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
