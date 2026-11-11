import { Compass } from 'lucide-react';
import { Link } from 'react-router';
import { Page } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';

export default function NotFoundPage() {
  return (
    <Page>
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Compass />
          </EmptyMedia>
          <EmptyTitle>Pagina non trovata</EmptyTitle>
          <EmptyDescription>L’indirizzo che hai aperto non esiste.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild>
            <Link to="/pazienti">Vai ai pazienti</Link>
          </Button>
        </EmptyContent>
      </Empty>
    </Page>
  );
}
