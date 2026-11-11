import { getDrugCatalogStatus } from '@alby/core';
import type { Metadata } from 'next';
import { Page, PageHeader } from '@/components/page';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ImportCatalogButton } from '@/features/medications/import-catalog-button';
import { formatDateTime } from '@/lib/format';
import { requirePageAdmin } from '@/server/context';

export const metadata: Metadata = { title: 'Elenco farmaci' };

export default async function DrugCatalogPage() {
  const ctx = await requirePageAdmin();
  const status = await getDrugCatalogStatus(ctx);
  const ready = status.packages > 0;

  return (
    <Page>
      <PageHeader title="Elenco farmaci" description="L’elenco dei farmaci autorizzati in Italia, usato per cercare i farmaci quando si inserisce una terapia." />

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>{ready ? `${status.products.toLocaleString('it-IT')} farmaci` : 'Elenco non ancora scaricato'}</CardTitle>
          <CardDescription>
            {ready
              ? `${status.packages.toLocaleString('it-IT')} confezioni · aggiornato il ${formatDateTime(status.importedAt)}`
              : 'Senza l’elenco i farmaci si possono comunque inserire, scrivendo il nome a mano.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm text-muted-foreground">
          <p>
            I dati vengono scaricati dal sito dell’Agenzia Italiana del Farmaco (AIFA), che li pubblica come dati aperti e li aggiorna ogni giorno. Basta
            aggiornare l’elenco ogni tanto, per esempio quando non trovi un farmaco nuovo.
          </p>
          <p>
            Al server arriva un file di circa 80 MB; nessun dato dei pazienti viene inviato. Fonte:{' '}
            <a href="https://www.aifa.gov.it/web/guest/liste-dei-farmaci" target="_blank" className="underline underline-offset-4" rel="noopener noreferrer">
              AIFA, Lista aggiornata dei Farmaci
            </a>{' '}
            (licenza CC BY 4.0).
          </p>
        </CardContent>
        <CardFooter>
          <ImportCatalogButton firstTime={!ready} />
        </CardFooter>
      </Card>
    </Page>
  );
}
