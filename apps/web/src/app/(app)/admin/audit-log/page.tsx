import { listAudit, listBlockedIps, listUsers, normalizeIp } from '@alby/core';
import { AUDIT_ACTION_LABELS, AUDIT_FILTERS, type AuditEntryDTO } from '@alby/shared';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Page, PageHeader } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AuditFilter, type AuditFilterValues } from '@/features/audit/audit-filter';
import { IpBlockButton } from '@/features/audit/ip-block-button';
import { formatDateTime } from '@/lib/format';
import { requirePageAdmin } from '@/server/context';

export const metadata: Metadata = { title: 'Audit Log' };

const PAGE_SIZE = 25;

const count = (n: unknown, one: string, many: string) => (typeof n === 'number' ? `${n} ${n === 1 ? one : many}` : null);

/** Su chi si è agito: il paziente (o l'utente) a cui la voce si riferisce. */
function subject(entry: AuditEntryDTO): { text: string; href?: string } | null {
  const d = (entry.details ?? {}) as Record<string, unknown>;
  if (entry.action === 'patient.deleted') return { text: typeof d.name === 'string' ? d.name : 'Paziente eliminato' };
  if (entry.patientId) {
    return entry.patientName
      ? { text: entry.patientName, href: `/pazienti/${entry.patientId}` }
      : { text: 'Paziente non più presente' };
  }
  if (entry.entity === 'user' && entry.action !== 'setup.admin_created') {
    return { text: entry.targetUserName ?? (typeof d.email === 'string' ? d.email : 'Utente non più presente') };
  }
  return null;
}

/** Informazioni in più sull'attività (solo metadati). */
function extras(entry: AuditEntryDTO): string[] {
  const d = (entry.details ?? {}) as Record<string, unknown>;
  const out: (string | null | false)[] = [];
  switch (entry.action) {
    case 'auth.login':
      out.push(d.client === 'mobile' ? 'dall’app' : d.client === 'web' ? 'dal sito' : null);
      break;
    case 'auth.login_failed':
      out.push(typeof d.email === 'string' ? `email: ${d.email}` : typeof d.reason === 'string' ? d.reason : null);
      break;
    case 'server.ip_blocked':
    case 'server.ip_unblocked':
      out.push(typeof d.ip === 'string' ? d.ip : null, count(d.sessions, 'sessione chiusa', 'sessioni chiuse'));
      break;
    case 'user.created':
      out.push(entry.targetUserName && typeof d.email === 'string' ? d.email : null);
      out.push(d.role === 'ADMIN' ? 'amministratore' : null);
      break;
    case 'report.created':
      out.push(d.fromPdf === true && 'da PDF', count(d.results, 'valore', 'valori'));
      break;
    case 'imaging.uploaded':
      out.push(count(d.added, 'immagine aggiunta', 'immagini aggiunte'));
      out.push(typeof d.duplicates === 'number' && d.duplicates > 0 && count(d.duplicates, 'già presente', 'già presenti'));
      out.push(typeof d.rejected === 'number' && d.rejected > 0 && count(d.rejected, 'scartata', 'scartate'));
      break;
    case 'medication.exported':
      out.push(count(d.medications, 'farmaco', 'farmaci'));
      break;
    case 'drugs.catalog_imported':
      out.push(count(d.packages, 'confezione', 'confezioni'));
      break;
  }
  return out.filter((s): s is string => !!s);
}

function Details({ entry }: { entry: AuditEntryDTO }) {
  const who = subject(entry);
  const more = extras(entry).join(' · ');
  if (!who && !more) return null;
  return (
    <span title={[who?.text, more].filter(Boolean).join(' · ')}>
      {who &&
        (who.href ? (
          <Link href={who.href} className="font-medium text-foreground hover:underline">
            {who.text}
          </Link>
        ) : (
          <span className="font-medium text-foreground">{who.text}</span>
        ))}
      {who && more && ' · '}
      {more}
    </span>
  );
}

type SearchParams = Promise<{ pagina?: string; tipo?: string; utente?: string; dal?: string; al?: string }>;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export default async function AuditPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requirePageAdmin();
  const sp = await searchParams;
  const filter = AUDIT_FILTERS.some((f) => f.value === sp.tipo) ? sp.tipo! : 'all';
  const page = Math.max(1, Number.parseInt(sp.pagina ?? '1', 10) || 1);
  const users = await listUsers(ctx);
  const filters: AuditFilterValues = {
    tipo: filter,
    utente: users.some((u) => u.id === sp.utente) ? sp.utente! : 'all',
    dal: sp.dal && DAY.test(sp.dal) ? sp.dal : '',
    al: sp.al && DAY.test(sp.al) ? sp.al : '',
  };

  const [data, blockedIps] = await Promise.all([
    listAudit(ctx, {
      page,
      pageSize: PAGE_SIZE,
      action: filter === 'all' ? undefined : `${filter}.`,
      userId: filters.utente === 'all' ? undefined : filters.utente,
      from: filters.dal || undefined,
      to: filters.al || undefined,
    }),
    listBlockedIps(ctx),
  ]);
  const blocked = new Set(blockedIps);
  const ownIp = normalizeIp(ctx.ip);
  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const href = (p: number) =>
    `?${new URLSearchParams({
      ...(filters.tipo !== 'all' ? { tipo: filters.tipo } : {}),
      ...(filters.utente !== 'all' ? { utente: filters.utente } : {}),
      ...(filters.dal ? { dal: filters.dal } : {}),
      ...(filters.al ? { al: filters.al } : {}),
      pagina: String(p),
    })}`;

  return (
    <Page>
      <PageHeader
        title="Audit Log"
        description="Chi ha consultato o modificato cosa, e quando. Utile anche ai fini del GDPR."
        actions={<AuditFilter value={filters} users={users.map((u) => ({ id: u.id, name: u.displayName }))} />}
      />

      {blockedIps.length > 0 && (
        <Card className="gap-2 p-4">
          <h2 className="text-sm font-medium">Indirizzi IP bloccati</h2>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-muted-foreground">
            {blockedIps.map((ip) => (
              <li key={ip} className="flex items-center gap-1">
                {ip}
                <IpBlockButton ip={ip} blocked />
              </li>
            ))}
          </ul>
        </Card>
      )}

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
              data.items.map((e) => {
                const ip = normalizeIp(e.ip);
                return (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap pl-4 text-sm tabular-nums">{formatDateTime(e.createdAt)}</TableCell>
                    <TableCell className="text-sm">{e.userName ?? <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell>
                      <Badge variant={e.action === 'auth.login_failed' || e.action.endsWith('.deleted') ? 'destructive' : 'secondary'}>
                        {AUDIT_ACTION_LABELS[e.action] ?? e.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden max-w-xs truncate text-sm text-muted-foreground md:table-cell">
                      <Details entry={e} />
                    </TableCell>
                    <TableCell className="hidden pr-4 font-mono text-xs text-muted-foreground lg:table-cell">
                      <span className="flex items-center gap-1">
                        {e.ip ?? '—'}
                        {ip && <IpBlockButton ip={ip} blocked={blocked.has(ip)} own={ip === ownIp} />}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })
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
