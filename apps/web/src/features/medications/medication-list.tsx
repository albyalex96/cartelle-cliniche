import type { MedicationDTO } from '@alby/shared';
import { BookOpen, ChevronRight, Pill } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDate } from '@/lib/format';
import { AddMedicationButton, MedicationRowActions } from './medication-buttons';

function Period({ m }: { m: MedicationDTO }) {
  if (m.startDate && m.endDate) return <>{`${formatDate(m.startDate)} – ${formatDate(m.endDate)}`}</>;
  if (m.startDate) return <>{`dal ${formatDate(m.startDate)}`}</>;
  if (m.endDate) return <>{`fino al ${formatDate(m.endDate)}`}</>;
  return <span className="text-muted-foreground">—</span>;
}

function MedicationTable({ items, canEdit }: { items: MedicationDTO[]; canEdit: boolean }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-4">Farmaco</TableHead>
            <TableHead>Come</TableHead>
            <TableHead className="hidden md:table-cell">Per cosa</TableHead>
            <TableHead className="hidden sm:table-cell">Periodo</TableHead>
            {canEdit && <TableHead className="w-12 pr-4" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((m) => (
            <TableRow key={m.id}>
              <TableCell className="pl-4 align-top whitespace-normal">
                <span className="grid gap-0.5">
                  <span className="font-medium">{m.name}</span>
                  {m.activeIngredient && <span className="text-xs text-muted-foreground">{m.activeIngredient}</span>}
                  {m.leafletUrl && m.aic && (
                    <Link
                      href={`/farmaci/${m.aic.slice(0, 6)}?da=${m.patientId}`}
                      className="inline-flex w-fit items-center gap-1 text-xs text-primary underline-offset-4 hover:underline"
                    >
                      <BookOpen className="size-3" />
                      Foglietto illustrativo
                    </Link>
                  )}
                </span>
              </TableCell>
              <TableCell className="align-top whitespace-normal">
                <span className="grid gap-1">
                  <span>{[m.dosage, m.frequency].filter(Boolean).join(' · ') || <span className="text-muted-foreground">—</span>}</span>
                  {m.asNeeded && (
                    <Badge variant="secondary" className="w-fit">
                      Al bisogno
                    </Badge>
                  )}
                  {m.notes && <span className="text-xs whitespace-pre-wrap text-muted-foreground">{m.notes}</span>}
                </span>
              </TableCell>
              <TableCell className="hidden align-top whitespace-normal md:table-cell">
                <span className="grid gap-0.5">
                  <span>{m.reason ?? <span className="text-muted-foreground">—</span>}</span>
                  {m.prescriber && <span className="text-xs text-muted-foreground">Prescritto da {m.prescriber}</span>}
                </span>
              </TableCell>
              <TableCell className="hidden align-top text-sm tabular-nums sm:table-cell">
                <Period m={m} />
              </TableCell>
              {canEdit && (
                <TableCell className="pr-4 text-right align-top">
                  <MedicationRowActions medication={m} />
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** Terapie del paziente: quelle in corso in evidenza, le concluse in una sezione richiudibile (Server Component). */
export function MedicationList({ patientId, medications, canEdit }: { patientId: string; medications: MedicationDTO[]; canEdit: boolean }) {
  if (medications.length === 0) {
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Pill />
          </EmptyMedia>
          <EmptyTitle>Nessun farmaco</EmptyTitle>
          <EmptyDescription>
            {canEdit
              ? 'Aggiungi i farmaci che il paziente prende, con dose e orari. Puoi cercarli per nome commerciale o principio attivo.'
              : 'Per questo paziente non sono ancora state inserite terapie.'}
          </EmptyDescription>
        </EmptyHeader>
        {canEdit && (
          <EmptyContent>
            <AddMedicationButton patientId={patientId} />
          </EmptyContent>
        )}
      </Empty>
    );
  }

  const current = medications.filter((m) => m.active);
  const past = medications.filter((m) => !m.active);

  return (
    <div className="grid gap-6">
      <section className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium">
            In corso <span className="text-muted-foreground tabular-nums">({current.length})</span>
          </h2>
          {canEdit && <AddMedicationButton patientId={patientId} />}
        </div>
        {current.length ? (
          <MedicationTable items={current} canEdit={canEdit} />
        ) : (
          <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Nessuna terapia in corso.</p>
        )}
      </section>

      {past.length > 0 && (
        // <details>: si apre e si chiude senza JavaScript.
        <details className="group grid gap-3">
          <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 font-medium [&::-webkit-details-marker]:hidden">
            <ChevronRight className="size-4 transition-transform group-open:rotate-90" />
            Terapie concluse <span className="text-muted-foreground tabular-nums">({past.length})</span>
          </summary>
          <div className="mt-3">
            <MedicationTable items={past} canEdit={canEdit} />
          </div>
        </details>
      )}
    </div>
  );
}
