import { AUDIT_ACTION_LABELS, type AuditEntryDTO, type Paginated } from '@alby/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Page, PageHeader } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { queryKeys } from '@/lib/query';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 25;

const FILTERS = [
  { value: 'all', label: 'Tutte le attività' },
  { value: 'auth.', label: 'Accessi e password' },
  { value: 'patient.', label: 'Pazienti' },
  { value: 'user.', label: 'Utenti' },
];

function describe(entry: AuditEntryDTO): string {
  const d = (entry.details ?? {}) as Record<string, unknown>;
  if (entry.action === 'auth.login_failed') {
    return typeof d.email === 'string' ? `Email: ${d.email}` : typeof d.reason === 'string' ? d.reason : '';
  }
  if (entry.action === 'patient.deleted' && typeof d.name === 'string') return d.name;
  if (entry.action === 'user.created' && typeof d.email === 'string') return d.email;
  return '';
}

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('all');
  const action = filter === 'all' ? '' : filter;

  const { data, isPending, isPlaceholderData } = useQuery({
    queryKey: queryKeys.audit(page, action),
    queryFn: () =>
      api.get<Paginated<AuditEntryDTO>>(
        `/audit?page=${page}&pageSize=${PAGE_SIZE}${action ? `&action=${encodeURIComponent(action)}` : ''}`,
      ),
    placeholderData: keepPreviousData,
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <Page>
      <PageHeader
        title="Registro accessi"
        description="Chi ha consultato o modificato cosa, e quando. Utile anche ai fini del GDPR."
        actions={
          <Select
            value={filter}
            onValueChange={(v) => {
              setFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {FILTERS.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      <Card className="py-0">
        <Table className={cn('transition-opacity', isPlaceholderData && 'opacity-60')}>
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
            {isPending ? (
              Array.from({ length: 8 }, (_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={5} className="px-4">
                    <Skeleton className="h-5" />
                  </TableCell>
                </TableRow>
              ))
            ) : data?.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  Nessuna attività registrata.
                </TableCell>
              </TableRow>
            ) : (
              data?.items.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-nowrap pl-4 text-sm tabular-nums">{formatDateTime(e.createdAt)}</TableCell>
                  <TableCell className="text-sm">{e.userName ?? <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell>
                    <Badge variant={e.action === 'auth.login_failed' || e.action.endsWith('.deleted') ? 'destructive' : 'secondary'}>
                      {AUDIT_ACTION_LABELS[e.action] ?? e.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden max-w-xs truncate text-sm text-muted-foreground md:table-cell">
                    {describe(e)}
                  </TableCell>
                  <TableCell className="hidden pr-4 font-mono text-xs text-muted-foreground lg:table-cell">{e.ip}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {data && data.total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Pagina {page} di {totalPages} · {data.total} voci
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft />
              Precedente
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Successiva
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}
    </Page>
  );
}
