import { listAudit } from '@alby/core';
import { AUDIT_ACTION_LABELS, type AuditEntryDTO } from '@alby/shared';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Page, PageHeader } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AuditFilter } from '@/features/audit/audit-filter';
import { AUDIT_FILTERS } from '@/features/audit/filters';
import { formatDateTime } from '@/lib/format';
import { requirePageAdmin } from '@/server/context';

export const metadata: Metadata = { title: 'Registro accessi' };

const PAGE_SIZE = 25;

function describe(entry: AuditEntryDTO): string {
  const d = (entry.details ?? {}) as Record<string, unknown>;
  if (entry.action === 'auth.login_failed') {
    return typeof d.email === 'string' ? `Email: ${d.email}` : typeof d.reason === 'string' ? d.reason : '';
  }
  if (entry.action === 'patient.deleted' && typeof d.name === 'string') return d.name;
  if (entry.action === 'user.created' && typeof d.email === 'string') return d.email;
  return '';
}

type SearchParams = Promise<{ pagina?: string; tipo?: string }>;

export default async function AuditPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requirePageAdmin();
  const sp = await searchParams;
  const filter = AUDIT_FILTERS.some((f) => f.value === sp.tipo) ? sp.tipo! : 'all';
  const page = Math.max(1, Number.parseInt(sp.pagina ?? '1', 10) || 1);

  const data = await listAudit(ctx, {
    page,
    pageSize: PAGE_SIZE,
    action: filter === 'all' ? undefined : `${filter}.`,
  });
  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const href = (p: number) => `?${new URLSearchParams({ ...(filter !== 'all' ? { tipo: filter } : {}), pagina: String(p) })}`;

  return (
    <Page>
      <PageHeader
        title="Registro accessi"
        description="Chi ha consultato o modificato cosa, e quando. Utile anche ai fini del GDPR."
        actions={<AuditFilter value={filter} />}
      />

      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Quando</TableHead>
              <TableHead>Chi</TableHead>
              <TableHead>Attività</TableHead>
              <TableHead className="hidden md:table-cell">Dettagli</TableHead>
              <TableHead className="hidden pr-4 lg:table-cell">IP</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  Nessuna attività registrata.
                </TableCell>
              </TableRow>
            ) : (
              data.items.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-nowrap pl-4 text-sm tabular-nums">{formatDateTime(e.createdAt)}</TableCell>
                  <TableCell className="text-sm">{e.userName ?? <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell>
                    <Badge variant={e.action === 'auth.login_failed' || e.action.endsWith('.deleted') ? 'destructive' : 'secondary'}>
                      {AUDIT_ACTION_LABELS[e.action] ?? e.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden max-w-xs truncate text-sm text-muted-foreground md:table-cell">{describe(e)}</TableCell>
                  <TableCell className="hidden pr-4 font-mono text-xs text-muted-foreground lg:table-cell">{e.ip ?? '—'}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Pagina {page} di {totalPages} · {data.total} voci
          </span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Button variant="outline" size="sm" asChild>
                <Link href={href(page - 1)}>
                  <ChevronLeft />
                  Precedente
                </Link>
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled>
                <ChevronLeft />
                Precedente
              </Button>
            )}
            {page < totalPages ? (
              <Button variant="outline" size="sm" asChild>
                <Link href={href(page + 1)}>
                  Successiva
                  <ChevronRight />
                </Link>
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled>
                Successiva
                <ChevronRight />
              </Button>
            )}
          </div>
        </div>
      )}
    </Page>
  );
}
