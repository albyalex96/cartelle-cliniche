import { getDrugCatalogStatus, isCatalogAutoUpdateEnabled, listDrugCatalog } from '@alby/core';
import { ChevronLeft, ChevronRight, FileText, Pill, SearchX } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Page, PageHeader } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { UrlSearch } from '@/components/url-search';
import { SortHeader } from '@/features/health-services/sort-header';
import { ImportCatalogButton } from '@/features/medications/import-catalog-button';
import { AutoUpdateBadge } from '@/features/settings/auto-update-badge';
import { formatDateTime } from '@/lib/format';
import { requirePageUser } from '@/server/context';

export const metadata: Metadata = { title: 'Elenco farmaci' };

type Param = string | string[] | undefined;
type SearchParams = Promise<{ q?: Param; ordine?: Param; verso?: Param; pagina?: Param }>;

/** Colonne ordinabili: nome nell'indirizzo (`?ordine=`) → ordinamento del servizio. */
const SORTS = { farmaco: 'name', principio: 'ingredient', forma: 'form', azienda: 'holder' } as const;
type SortKey = keyof typeof SORTS;

const text = (p: Param) => (typeof p === 'string' ? p : '').trim().slice(0, 100);

/** Elenco dei farmaci AIFA: tutti possono consultarlo, solo l'amministratore lo aggiorna. */
export default async function DrugCatalogPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requirePageUser();
  const sp = await searchParams;
  const q = text(sp.q);
  // Senza una colonna scelta: in ordine alfabetico, oppure per pertinenza se si sta cercando.
  const order: SortKey | null = text(sp.ordine) in SORTS ? (text(sp.ordine) as SortKey) : q ? null : 'farmaco';
  const direction = order && sp.verso === 'desc' ? 'desc' : 'asc';
  const page = Math.min(10_000, Math.max(1, Number.parseInt(text(sp.pagina) || '1', 10) || 1));
  const isAdmin = ctx.user.role === 'ADMIN';

  const [data, status, autoUpdate] = await Promise.all([
    listDrugCatalog(ctx, { q, sort: order ? SORTS[order] : undefined, direction, page }),
    isAdmin ? getDrugCatalogStatus(ctx) : null,
    isCatalogAutoUpdateEnabled(ctx, 'drugs'),
  ]);

  // Filtri in uso, da riportare negli indirizzi (ricerca, pagine, foglietto illustrativo).
  const filters: Record<string, string> = {
    ...(q ? { q } : {}),
    ...(order && (q || order !== 'farmaco') ? { ordine: order } : {}),
    ...(direction === 'desc' ? { verso: 'desc' } : {}),
  };
  const href = (params: Record<string, string>) => {
    const query = new URLSearchParams(params).toString();
    return query ? `?${query}` : '/farmaci';
  };
  const pageHref = (p: number) => href({ ...filters, ...(p > 1 ? { pagina: String(p) } : {}) });
  const { q: _q, ...withoutQuery } = filters;
  const { ordine: _order, verso: _direction, ...withoutSorting } = filters;
  // Cliccando una colonna: crescente; cliccando quella già in uso: verso opposto. Si riparte dalla prima pagina.
  const sortHeader = (key: SortKey, label: string) => (
    <SortHeader
      label={label}
      direction={order === key ? direction : null}
      href={href({
        ...withoutSorting,
        ...(q || key !== 'farmaco' ? { ordine: key } : {}),
        ...(order === key && direction === 'asc' ? { verso: 'desc' } : {}),
      })}
    />
  );
  const ariaSort = (key: SortKey) => (order !== key ? undefined : direction === 'asc' ? 'ascending' : 'descending');
  const listQuery = new URLSearchParams({ ...filters, ...(page > 1 ? { pagina: String(page) } : {}) }).toString();
  const leafletQuery = listQuery ? `?${listQuery}` : '';

  return (
    <Page>
      <PageHeader
        title="Elenco farmaci"
        description={
          <>
            <p>I farmaci autorizzati in Italia, dai dati aperti dell’AIFA.</p>
            <AutoUpdateBadge enabled={autoUpdate} className="mt-2" />
          </>
        }
      />

      {status && (
        <Card>
          <CardHeader>
            <CardTitle>{status.packages > 0 ? `${status.products.toLocaleString('it-IT')} farmaci in elenco` : 'Elenco non ancora scaricato'}</CardTitle>
            <CardDescription>
              {status.packages > 0
                ? `${status.packages.toLocaleString('it-IT')} confezioni · aggiornato il ${formatDateTime(status.importedAt)}. `
                : 'Senza l’elenco i farmaci si possono comunque inserire nelle terapie, scrivendo il nome a mano. '}
              L’aggiornamento scarica dal sito dell’
              <a href="https://www.aifa.gov.it/web/guest/liste-dei-farmaci" target="_blank" className="underline underline-offset-4" rel="noopener noreferrer">
                AIFA
              </a>{' '}
              un file di circa 80 MB (licenza CC BY 4.0); nessun dato dei pazienti viene inviato.
            </CardDescription>
            <CardAction className="col-start-1 row-span-1 row-start-auto mt-2 justify-self-start sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:mt-0 sm:justify-self-end">
              <ImportCatalogButton firstTime={status.packages === 0} />
            </CardAction>
          </CardHeader>
        </Card>
      )}

      {data.catalogReady ? (
        <>
          <UrlSearch defaultValue={q} placeholder="Nome commerciale o principio attivo" label="Cerca farmaci" params={withoutQuery} />

          {data.approximate && (
            <p className="text-sm text-muted-foreground">
              Nessun farmaco corrisponde a “{q}”. Forse cercavi:
            </p>
          )}

          {data.items.length > 0 ? (
            <Card className="py-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4" aria-sort={ariaSort('farmaco')}>
                      {sortHeader('farmaco', 'Farmaco')}
                    </TableHead>
                    <TableHead className="hidden md:table-cell" aria-sort={ariaSort('principio')}>
                      {sortHeader('principio', 'Principio attivo')}
                    </TableHead>
                    <TableHead className="hidden lg:table-cell" aria-sort={ariaSort('forma')}>
                      {sortHeader('forma', 'Forma')}
                    </TableHead>
                    <TableHead className="hidden xl:table-cell" aria-sort={ariaSort('azienda')}>
                      {sortHeader('azienda', 'Azienda')}
                    </TableHead>
                    <TableHead className="pr-4 text-right">Foglietto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((d) => (
                    <TableRow key={d.aic}>
                      <TableCell className="pl-4 whitespace-normal">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="font-medium">{d.name}</span>
                          {d.withdrawn && (
                            <Badge variant="outline" className="h-5 text-[11px]">
                              Non più in commercio
                            </Badge>
                          )}
                        </span>
                        {d.activeIngredient && <span className="mt-0.5 block text-xs text-muted-foreground md:hidden">{d.activeIngredient}</span>}
                      </TableCell>
                      <TableCell className="hidden max-w-xs whitespace-normal text-sm md:table-cell">
                        {d.activeIngredient ?? <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="hidden max-w-xs whitespace-normal text-sm text-muted-foreground lg:table-cell">{d.forms.join(', ') || '—'}</TableCell>
                      <TableCell className="hidden max-w-56 truncate text-sm text-muted-foreground xl:table-cell">{d.holder ?? '—'}</TableCell>
                      <TableCell className="pr-4 text-right">
                        {d.hasLeaflet ? (
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/farmaci/${d.aic}${leafletQuery}`} aria-label={`Foglietto illustrativo di ${d.name}`}>
                              <FileText />
                              Apri
                            </Link>
                          </Button>
                        ) : (
                          <span className="pr-2.5 text-muted-foreground">—</span>
                        )}
                      </TableCell>
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
                <EmptyDescription>{q && page === 1 ? `Nessun farmaco corrisponde a “${q}”.` : 'Non ci sono altri farmaci in questa pagina.'}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}

          {(page > 1 || data.hasMore) && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Pagina {page}</span>
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
                {data.hasMore ? (
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
            </div>
          )}
        </>
      ) : (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Pill />
            </EmptyMedia>
            <EmptyTitle>Elenco non ancora disponibile</EmptyTitle>
            <EmptyDescription>
              {isAdmin ? 'Scarica l’elenco dall’AIFA con il pulsante qui sopra.' : 'L’amministratore non ha ancora scaricato l’elenco dei farmaci.'}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </Page>
  );
}
