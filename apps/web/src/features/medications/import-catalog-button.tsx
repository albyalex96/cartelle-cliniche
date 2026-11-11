'use client';

import { RefreshCw } from 'lucide-react';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { importDrugCatalogAction } from '@/server/actions/medications';

/** Scarica dall'AIFA l'elenco aggiornato (sul server: il browser aspetta solo la risposta). */
export function ImportCatalogButton({ firstTime }: { firstTime: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await importDrugCatalogAction();
          if (result.ok) toast.success(`Elenco aggiornato: ${result.data.products.toLocaleString('it-IT')} farmaci`);
          else toast.error(result.message);
        })
      }
    >
      {pending ? <Spinner /> : <RefreshCw />}
      {pending ? 'Scaricamento in corso (circa un minuto)…' : firstTime ? 'Scarica l’elenco dall’AIFA' : 'Aggiorna dall’AIFA'}
    </Button>
  );
}
