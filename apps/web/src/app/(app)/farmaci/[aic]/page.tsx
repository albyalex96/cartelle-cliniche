import { getDrugInfo } from '@alby/core';
import { idSchema } from '@alby/shared';
import { ArrowLeft, Download, ExternalLink } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { Page, PageHeader } from '@/components/page';
import { Button } from '@/components/ui/button';
import { requirePageUser } from '@/server/context';
import { orNotFound } from '@/server/not-found';

type Props = { params: Promise<{ aic: string }>; searchParams: Promise<{ da?: string }> };

const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s/(-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
const capitalize = (s: string) => s[0]!.toUpperCase() + s.slice(1).toLowerCase();

const load = cache(async (aic: string) => orNotFound(getDrugInfo(await requirePageUser(), aic)));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `Foglietto illustrativo: ${titleCase((await load((await params).aic)).name)}` };
}

/** Foglietto illustrativo AIFA mostrato dentro l'app (Server Component: il PDF lo apre il browser). */
export default async function LeafletPage({ params, searchParams }: Props) {
  const drug = await load((await params).aic);
  if (!drug.hasLeaflet) notFound();
  // Ritorno alla scheda del paziente da cui si è arrivati (solo un id valido, mai un indirizzo qualsiasi).
  const from = idSchema.safeParse((await searchParams).da);
  const back = from.success ? `/pazienti/${from.data}?tab=therapy` : '/pazienti';
  const src = `/api/farmaci/${drug.aic}/foglietto`;

  return (
    <Page>
      <Button variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground" asChild>
        <Link href={back}>
          <ArrowLeft />
          {from.success ? 'Terapie' : 'Pazienti'}
        </Link>
      </Button>

      <PageHeader
        title={titleCase(drug.name)}
        description={[drug.activeIngredient && capitalize(drug.activeIngredient), drug.holder].filter(Boolean).join(' · ')}
        actions={
          <>
            <Button variant="outline" asChild>
              <a href={src} target="_blank" rel="noopener">
                <ExternalLink />
                Apri a schermo intero
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a href={`${src}?download=1`} download>
                <Download />
                Scarica
              </a>
            </Button>
          </>
        }
      />

      <iframe src={`${src}#view=FitH`} title={`Foglietto illustrativo di ${titleCase(drug.name)}`} className="h-[calc(100svh-12rem)] min-h-[28rem] w-full rounded-xl border bg-muted" />
      <p className="text-xs text-muted-foreground">
        Fonte: AIFA, Banca dati farmaci. Se sul telefono il documento non compare, usa “Apri a schermo intero”.
      </p>
    </Page>
  );
}
