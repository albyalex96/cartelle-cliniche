'use client';

import { RefreshCw } from 'lucide-react';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { importHealthServicesAction } from '@/server/actions/health-services';

/** Scarica dal portale della Regione il catalogo aggiornato (sul server: il browser aspetta solo la risposta). */
export function ImportServicesButton({ firstTime }: { firstTime: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await importHealthServicesAction();
          if (result.ok) toast.success(`Catalogo aggiornato: ${result.data.inForce.toLocaleString('it-IT')} prestazioni in vigore`);
          else toast.error(result.message);
        })
      }
    >
      {pending ? <Spinner /> : <RefreshCw />}
      {pending ? 'Scaricamento in corso…' : firstTime ? 'Scarica il catalogo dalla Regione' : 'Aggiorna dalla Regione'}
    </Button>
  );
}
