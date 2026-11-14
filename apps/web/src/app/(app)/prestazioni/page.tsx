import { getHealthServiceCatalogStatus, listHealthServices } from '@alby/core';
import { ChevronLeft, ChevronRight, SearchX, Stethoscope } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Page, PageHeader } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { UrlSearch } from '@/components/url-search';
import { AccessBadge } from '@/features/health-services/access-badge';
import { BranchFilter } from '@/features/health-services/branch-filter';
import { ImportServicesButton } from '@/features/health-services/import-services-button';
import { SortHeader } from '@/features/health-services/sort-header';
import { formatDate, formatDateTime, formatEuro } from '@/lib/format';
import { requirePageUser } from '@/server/context';

export const metadata: Metadata = { title: 'Prestazioni' };

type Param = string | string[] | undefined;
type SearchParams = Promise<{ q?: Param; branca?: Param; cessate?: Param; ordine?: Param; verso?: Param; pagina?: Param }>;

/** Colonne ordinabili: nome nell'indirizzo (`?ordine=`) → ordinamento del servizio. */
const SORTS = { codice: 'code', prestazione: 'name', branca: 'branch', tariffa: 'tariff' } as const;
type SortKey = keyof typeof SORTS;

const text = (p: Param) => (typeof p === 'string' ? p : '').trim().slice(0, 100);
const SOURCE_URL = 'https://sist.sanita.puglia.it/en/erogatori-pubblici-e-privati-accreditati';

/** Catalogo delle prestazioni della Regione Puglia: tutti possono consultarlo, solo l'amministratore lo aggiorna. */
export default async function HealthServicesPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requirePageUser();
  const sp = await searchParams;
  const q = text(sp.q);
  const branch = text(sp.branca);
  // `?cessate=solo`: solo le voci cessate; `?cessate=1` (dalla scheda, "tutte le voci del codice"): anche le cessate.
  const ceased = sp.cessate === 'solo' ? 'only' : sp.cessate === '1' ? 'include' : 'exclude';
  const order: SortKey = text(sp.ordine) in SORTS ? (text(sp.ordine) as SortKey) : 'codice';
  const direction = sp.verso === 'desc' ? 'desc' : 'asc';
  const page = Math.min(10_000, Math.max(1, Number.parseInt(text(sp.pagina) || '1', 10) || 1));
  const isAdmin = ctx.user.role === 'ADMIN';

  const [data, status] = await Promise.all([
    listHealthServices(ctx, { q, branch: branch || undefined, ceased, sort: SORTS[order], direction, page }),
    isAdmin ? getHealthServiceCatalogStatus(ctx) : null,
  ]);

  // Filtri in uso, da riportare negli indirizzi (ricerca, branca, pagine, scheda della prestazione).
  const sorting = { ...(order !== 'codice' ? { ordine: order } : {}), ...(direction === 'desc' ? { verso: 'desc' } : {}) };
  const filters = { ...(q ? { q } : {}), ...(branch ? { branca: branch } : {}), ...(ceased !== 'exclude' ? { cessate: ceased === 'only' ? 'solo' : '1' } : {}), ...sorting };
  const href = (params: Record<string, string>) => {
    const query = new URLSearchParams(params).toString();
    return query ? `?${query}` : '/prestazioni';
  };
  const pageHref = (p: number) => href({ ...filters, ...(p > 1 ? { pagina: String(p) } : {}) });
  const { cessate: _ceased, ...withoutCeased } = filters;
  const { q: _q, ...withoutQuery } = filters;
  const { branca: _branch, ...withoutBranch } = filters;
  const { ordine: _order, verso: _direction, ...withoutSorting } = filters;
  // Cliccando una colonna: crescente; cliccando quella già in uso: verso opposto. Si riparte dalla prima pagina.
  const sortHeader = (key: SortKey, label: string, alignEnd = false) => (
    <SortHeader
      label={label}
      alignEnd={alignEnd}
      direction={order === key ? direction : null}
      href={href({ ...withoutSorting, ...(key !== 'codice' ? { ordine: key } : {}), ...(order === key && direction === 'asc' ? { verso: 'desc' } : {}) })}
    />
  );
  const ariaSort = (key: SortKey) => (order !== key ? undefined : direction === 'asc' ? 'ascending' : 'descending');
  const detailQuery = new URLSearchParams({ ...filters, ...(page > 1 ? { pagina: String(page) } : {}) }).toString();
  const lastPage = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <Page>
      <PageHeader
        title="Prestazioni"
        description="Le prestazioni specialistiche ambulatoriali del Servizio sanitario della Regione Puglia, con codici e tariffe."
      />

      {status && (
        <Card>
          <CardHeader>
            <CardTitle>
              {status.services > 0 ? `${status.inForce.toLocaleString('it-IT')} prestazioni in vigore` : 'Catalogo non ancora scaricato'}
            </CardTitle>
            <CardDescription>
              {status.services > 0 && (
                <>
                  {(status.services - status.inForce).toLocaleString('it-IT')} cessate · {status.priced.toLocaleString('it-IT')} con tariffa · aggiornato il{' '}
                  {formatDateTime(status.importedAt)}.{' '}
                </>
              )}
              L’aggiornamento scarica dal{' '}
              <a href={SOURCE_URL} target="_blank" className="underline underline-offset-4" rel="noopener noreferrer">
                portale SIST della Regione Puglia
              </a>{' '}
              il Catalogo Unico Regionale e il Nomenclatore tariffario (circa 1 MB); nessun dato dei pazienti viene inviato.
              {status.catalogSource && (
                <span className="mt-1 block text-xs">
                  File in uso: {status.catalogSource}
                  {status.tariffSource ? ` · ${status.tariffSource}` : ' · tariffe non disponibili'}
                </span>
              )}
            </CardDescription>
            <CardAction className="col-start-1 row-span-1 row-start-auto mt-2 justify-self-start sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:mt-0 sm:justify-self-end">
              <ImportServicesButton firstTime={status.services === 0} />
            </CardAction>
          </CardHeader>
        </Card>
      )}

      {data.catalogReady ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <UrlSearch defaultValue={q} placeholder="Nome della prestazione o codice (es. 89.13 o 8913)" label="Cerca prestazioni" params={withoutQuery} />
            {data.branches.length > 0 && <BranchFilter value={branch} branches={data.branches} params={withoutBranch} />}
            <Button variant="outline" size="sm" asChild>
              <Link href={href(ceased === 'only' ? withoutCeased : { ...withoutCeased, cessate: 'solo' })} scroll={false}>
                {ceased === 'only' ? 'Nascondi le cessate' : 'Solo le cessate'}
              </Link>
            </Button>
          </div>

          {data.items.length > 0 ? (
            <Card className="py-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4" aria-sort={ariaSort('codice')}>
                      {sortHeader('codice', 'Codice')}
                    </TableHead>
                    <TableHead aria-sort={ariaSort('prestazione')}>{sortHeader('prestazione', 'Prestazione')}</TableHead>
                    <TableHead className="hidden lg:table-cell" aria-sort={ariaSort('branca')}>
                      {sortHeader('branca', 'Branca')}
                    </TableHead>
                    <TableHead className="pr-4 text-right" aria-sort={ariaSort('tariffa')}>
                      {sortHeader('tariffa', 'Tariffa', true)}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="pl-4 align-top font-mono text-sm">
                        {s.code ?? s.oldCode ?? '—'}
                        <span className="block text-xs text-muted-foreground">{s.alphaCode ?? s.oldAlphaCode ?? s.regionalCode}</span>
                      </TableCell>
                      <TableCell className="whitespace-normal align-top">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <Link href={`/prestazioni/${s.id}${detailQuery ? `?${detailQuery}` : ''}`} className="font-medium underline-offset-4 hover:underline">
                            {s.name}
                          </Link>
                          {s.validTo && (
                            <Badge variant="outline" className="h-5 text-[11px]">
                              Cessata il {formatDate(s.validTo)}
                            </Badge>
                          )}
                          {!s.validTo && s.active !== true && (
                            <Badge variant="outline" className="h-5 text-[11px]">
                              Non ancora attiva
                            </Badge>
                          )}
                          {s.accessType && <AccessBadge type={s.accessType} />}
                        </span>
                        {s.notes && <span className="mt-0.5 block text-xs text-muted-foreground">{s.notes}</span>}
                        {s.branches.length > 0 && <span className="mt-0.5 block text-xs text-muted-foreground lg:hidden">{s.branches.join(', ')}</span>}
                      </TableCell>
                      <TableCell className="hidden max-w-56 whitespace-normal align-top text-sm text-muted-foreground lg:table-cell">
                        {s.branches.join(', ') || '—'}
                      </TableCell>
                      <TableCell className="pr-4 text-right align-top tabular-nums">{formatEuro(s.tariff)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          ) : (
            <Empty className="border border-dashed">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <SearchX />
                </EmptyMedia>
                <EmptyTitle>Nessun risultato</EmptyTitle>
                <EmptyDescription>
                  {page > 1 ? 'Non ci sono altre prestazioni in questa pagina.' : 'Nessuna prestazione corrisponde alla ricerca.'}
                  {ceased === 'exclude' && page === 1 && ' Prova a cercare tra quelle cessate.'}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {data.total.toLocaleString('it-IT')} {data.total === 1 ? 'prestazione' : 'prestazioni'}
              {lastPage > 1 && ` · pagina ${page} di ${lastPage.toLocaleString('it-IT')}`}
            </span>
            {lastPage > 1 && (
              <div className="flex gap-2">
                {page > 1 ? (
                  <Button variant="outline" size="sm" asChild>
                    <Link href={pageHref(page - 1)}>
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
                {page < lastPage ? (
                  <Button variant="outline" size="sm" asChild>
                    <Link href={pageHref(page + 1)}>
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
            )}
          </div>
        </>
      ) : (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Stethoscope />
            </EmptyMedia>
            <EmptyTitle>Catalogo non ancora disponibile</EmptyTitle>
            <EmptyDescription>
              {isAdmin ? 'Scarica il catalogo dal portale della Regione con il pulsante qui sopra.' : 'L’amministratore non ha ancora scaricato il catalogo delle prestazioni.'}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </Page>
  );
}
