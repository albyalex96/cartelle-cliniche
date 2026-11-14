import { getHealthService } from '@alby/core';
import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { cache, type ReactNode } from 'react';
import { Page, PageHeader } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AccessBadge } from '@/features/health-services/access-badge';
import { formatDate, formatEuro } from '@/lib/format';
import { requirePageUser } from '@/server/context';
import { orNotFound } from '@/server/not-found';

type Param = string | string[] | undefined;
type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ q?: Param; branca?: Param; cessate?: Param; ordine?: Param; verso?: Param; pagina?: Param }> };

const load = cache(async (id: string) => orNotFound(getHealthService(await requirePageUser(), id)));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `Prestazione: ${(await load((await params).id)).name}` };
}

/** Una voce (etichetta e valore) della scheda; le voci senza valore non compaiono. */
function Item({ label, children, mono }: { label: string; children: ReactNode; mono?: boolean }) {
  if (children === null || children === undefined || children === '') return null;
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={mono ? 'font-mono text-sm' : 'text-sm'}>{children}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">{children}</dl>
      </CardContent>
    </Card>
  );
}

/** Tutti i dati di una prestazione del catalogo regionale (Server Component: dati pubblici, nessuna interattività). */
export default async function HealthServicePage({ params, searchParams }: Props) {
  const s = await load((await params).id);
  // Ritorno all'elenco con la ricerca e i filtri che si stavano usando.
  const sp = await searchParams;
  const back = new URLSearchParams();
  for (const key of ['q', 'branca', 'cessate', 'ordine', 'verso', 'pagina'] as const) {
    const value = sp[key];
    if (typeof value === 'string' && value) back.set(key, value.slice(0, 100));
  }
  const sameCode = s.code ?? s.oldCode;
  const wide = 'sm:col-span-2';

  return (
    <Page className="max-w-4xl">
      <Button variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground" asChild>
        <Link href={`/prestazioni${back.size ? `?${back}` : ''}`}>
          <ArrowLeft />
          Elenco prestazioni
        </Link>
      </Button>

      <PageHeader
        title={<span className="whitespace-normal">{s.name}</span>}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{[s.code ?? s.oldCode, s.alphaCode ?? s.oldAlphaCode].filter(Boolean).join(' · ')}</span>
            {s.validTo ? (
              <Badge variant="outline">Cessata il {formatDate(s.validTo)}</Badge>
            ) : s.active === true ? (
              <Badge variant="secondary">In vigore</Badge>
            ) : (
              <Badge variant="outline">Non ancora attiva</Badge>
            )}
            {s.accessType && <AccessBadge type={s.accessType} />}
          </span>
        }
      />

      <Section title="Tariffa e branca">
        <Item label="Tariffa">{s.tariff === null ? 'Non presente nel Nomenclatore tariffario scaricato' : formatEuro(s.tariff)}</Item>
        <Item label="Branca">{s.branches.join(', ')}</Item>
        <Item label="Ciclo terapeutico">{s.therapeuticCycle === null ? null : s.therapeuticCycle ? 'Sì' : 'No'}</Item>
        <Item label="Tariffario">{s.tariffList}</Item>
      </Section>

      <Section title="Codici">
        <Item label="Codice nomenclatore (DPCM 2017)" mono>
          {s.code}
        </Item>
        <Item label="Codice regionale alfanumerico (DPCM 2017)" mono>
          {s.alphaCode}
        </Item>
        <Item label="Codice regionale numerico" mono>
          {s.regionalCode}
        </Item>
        <Item label="Codice nomenclatore precedente (DPCM 1996)" mono>
          {s.oldCode}
        </Item>
        <Item label="Codice regionale alfanumerico precedente" mono>
          {s.oldAlphaCode}
        </Item>
      </Section>

      <Section title="Denominazioni">
        <div className={wide}>
          <Item label="Denominazione estesa del catalogo">{s.name}</Item>
        </div>
        <Item label="Denominazione standard">{s.standardName}</Item>
        <Item label="Denominazione breve">{s.shortName}</Item>
        <div className={wide}>
          <Item label="Denominazione del nomenclatore (DPCM 2017)">{s.nomenclatureName}</Item>
        </div>
        <div className={wide}>
          <Item label="Denominazione del nomenclatore precedente (DPCM 1996)">{s.oldNomenclatureName}</Item>
        </div>
      </Section>

      <Section title="Validità e note">
        <Item label="Inizio validità">{[s.validFrom && formatDate(s.validFrom), s.validFromRef].filter(Boolean).join(' · ')}</Item>
        <Item label="Fine validità">{[s.validTo && formatDate(s.validTo), s.validToRef].filter(Boolean).join(' · ')}</Item>
        <Item label="Attiva">{s.active === null ? 'Da attivare' : s.active ? 'Sì' : 'No'}</Item>
        <Item label="Tipo di accesso">
          {s.accessType === 'P' ? 'Primo accesso (da non usare per i controlli)' : s.accessType === 'C' ? 'Controllo (da non usare per i primi accessi)' : 'Non distinta'}
        </Item>
        <div className={wide}>
          <Item label="Note">{s.notes}</Item>
        </div>
      </Section>

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>Fonte: Regione Puglia, Catalogo Unico Regionale delle prestazioni specialistiche e Nomenclatore tariffario (portale SIST).</span>
        {sameCode && (
          <Button variant="outline" size="sm" asChild>
            <Link href={`/prestazioni?${new URLSearchParams({ q: sameCode, ...(s.validTo ? { cessate: '1' } : {}) })}`}>Tutte le voci del codice {sameCode}</Link>
          </Button>
        )}
      </div>
    </Page>
  );
}
