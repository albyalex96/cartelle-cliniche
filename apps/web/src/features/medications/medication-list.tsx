import type { MedicationDTO } from '@alby/shared';
import { BookOpen, ChevronRight, Download, Pill } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { AddMedicationButton, MedicationRowActions } from './medication-buttons';

function Period({ m }: { m: MedicationDTO }) {
  if (m.startDate && m.endDate) return <>{`${formatDate(m.startDate)} – ${formatDate(m.endDate)}`}</>;
  if (m.startDate) return <>{`dal ${formatDate(m.startDate)}`}</>;
  if (m.endDate) return <>{`fino al ${formatDate(m.endDate)}`}</>;
  return <span className="text-muted-foreground">—</span>;
}

function MedicationTable({ items, canEdit }: { items: MedicationDTO[]; canEdit: boolean }) {
  return (
    <div className="overflow-hidden rounded-lg border">
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
                  <span className="font-medium">{[m.name, m.strength].filter(Boolean).join(' ')}</span>
                  {m.form && <span className="text-xs">{m.form}</span>}
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

/**
 * Card "Terapie" nella panoramica del paziente (Server Component): farmaci in corso con le loro azioni,
 * terapie concluse in una sezione richiudibile. C'è sempre, anche vuota; i pulsanti stanno nell'intestazione.
 */
export function TherapyCard({ patientId, medications, canEdit, className }: { patientId: string; medications: MedicationDTO[]; canEdit: boolean; className?: string }) {
  const current = medications.filter((m) => m.active);
  const past = medications.filter((m) => !m.active);

  return (
    <Card id="terapie" className={cn('scroll-mt-4', className)}>
      <CardHeader>
        <CardTitle>
          Terapia in corso {current.length > 0 && <span className="font-normal text-muted-foreground tabular-nums">({current.length})</span>}
        </CardTitle>
        <CardDescription>Farmaci che il paziente prende, con dose e orari.</CardDescription>
        {(current.length > 0 || canEdit) && (
          <CardAction className="flex flex-wrap items-center justify-end gap-2">
            {current.length > 0 && (
              <Button variant="outline" asChild>
                {/* Link normale: il PDF lo prepara il server e il browser lo scarica. */}
                <a href={`/api/terapie/${patientId}`} download>
                  <Download />
                  Scarica PDF
                </a>
              </Button>
            )}
            {canEdit && <AddMedicationButton patientId={patientId} />}
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="grid gap-4">
        {current.length ? (
          <MedicationTable items={current} canEdit={canEdit} />
        ) : (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Pill className="size-4 shrink-0" />
            {canEdit
              ? 'Nessuna terapia in corso. Con “Aggiungi farmaco” puoi cercare un farmaco per nome commerciale o principio attivo.'
              : 'Nessuna terapia in corso.'}
          </p>
        )}

        {past.length > 0 && (
          // <details>: si apre e si chiude senza JavaScript.
          <details className="group">
            <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 text-sm font-medium [&::-webkit-details-marker]:hidden">
              <ChevronRight className="size-4 transition-transform group-open:rotate-90" />
              Terapie concluse <span className="font-normal text-muted-foreground tabular-nums">({past.length})</span>
            </summary>
            <div className="mt-3">
              <MedicationTable items={past} canEdit={canEdit} />
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
