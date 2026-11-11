import { Compass } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';

export default function NotFound() {
  return (
    <div className="flex min-h-[60svh] items-center justify-center p-4">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Compass />
          </EmptyMedia>
          <EmptyTitle>Pagina non trovata</EmptyTitle>
          <EmptyDescription>L’indirizzo che hai aperto non esiste o non hai i permessi per vederlo.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild>
            <Link href="/pazienti">Vai ai pazienti</Link>
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  );
}
