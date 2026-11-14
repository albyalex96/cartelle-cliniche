import { listReportTemplates } from '@alby/core';
import { REPORT_FIELD_TYPE_LABELS } from '@alby/shared';
import { Copy, Pencil, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Page, PageHeader } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DeleteTemplateButton } from '@/features/report-templates/delete-template-button';
import { requirePageAdmin } from '@/server/context';

export const metadata: Metadata = { title: 'Tipi di referto' };

export default async function ReportTemplatesPage() {
  const templates = await listReportTemplates(await requirePageAdmin());

  return (
    <Page>
      <PageHeader
        title="Tipi di referto"
        description="I modelli tra cui si sceglie quando si inserisce un referto: per ognuno decidi quali campi compilare."
        actions={
          <Button asChild>
            <Link href="/admin/tipi-referto/nuovo">
              <Plus />
              Nuovo tipo
            </Link>
          </Button>
        }
      />

      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Tipo</TableHead>
              <TableHead className="hidden md:table-cell">Campi</TableHead>
              <TableHead className="w-32 pr-4 text-right">Azioni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="pl-4 align-top whitespace-normal">
                  <Link href={`/admin/tipi-referto/${t.id}`} className="font-medium underline-offset-4 hover:underline">
                    {t.name}
                  </Link>
                  {t.description && <div className="text-xs text-muted-foreground">{t.description}</div>}
                </TableCell>
                <TableCell className="hidden align-top whitespace-normal md:table-cell">
                  {t.fields.length === 0 ? (
                    <span className="text-sm text-muted-foreground">Solo titolo e data</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {t.fields.map((f) => (
                        <Badge key={f.key} variant="secondary" title={`${REPORT_FIELD_TYPE_LABELS[f.type]}${f.required ? ' · obbligatorio' : ''}`}>
                          {f.label}
                          {f.required && ' *'}
                        </Badge>
                      ))}
                    </div>
                  )}
                </TableCell>
                <TableCell className="pr-4 align-top">
                  <div className="flex justify-end gap-0.5">
                    <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-foreground" asChild>
                      <Link href={`/admin/tipi-referto/${t.id}`} aria-label={`Modifica ${t.name}`} title="Modifica">
                        <Pencil />
                      </Link>
                    </Button>
                    <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-foreground" asChild>
                      <Link href={`/admin/tipi-referto/nuovo?da=${t.id}`} aria-label={`Duplica ${t.name}`} title="Duplica">
                        <Copy />
                      </Link>
                    </Button>
                    <DeleteTemplateButton id={t.id} name={t.name} disabled={templates.length <= 1} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </Page>
  );
}
