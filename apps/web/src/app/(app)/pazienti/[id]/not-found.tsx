import { UserRoundX } from 'lucide-react';
import Link from 'next/link';
import { Page } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';

export default function PatientNotFound() {
  return (
    <Page>
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <UserRoundX />
          </EmptyMedia>
          <EmptyTitle>Paziente non trovato</EmptyTitle>
          <EmptyDescription>Il paziente non esiste o non hai accesso alla sua scheda.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" asChild>
            <Link href="/pazienti">Torna ai pazienti</Link>
          </Button>
        </EmptyContent>
      </Empty>
    </Page>
  );
}
