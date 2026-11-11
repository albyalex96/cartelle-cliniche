'use client';

import { RefreshCw, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';

/** Errore imprevisto in una pagina: il dettaglio resta nel log del server, qui solo un messaggio. */
export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Empty className="border border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <TriangleAlert />
        </EmptyMedia>
        <EmptyTitle>Qualcosa è andato storto</EmptyTitle>
        <EmptyDescription>Non è stato possibile caricare la pagina. Riprova tra qualche istante.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={reset}>
          <RefreshCw />
          Riprova
        </Button>
      </EmptyContent>
    </Empty>
  );
}
