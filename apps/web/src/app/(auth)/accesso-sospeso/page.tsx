import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthCard } from '@/components/auth-card';
import { Button } from '@/components/ui/button';
import { logoutAction } from '@/server/actions/auth';
import { isSessionSuspended } from '@/server/context';

export const metadata: Metadata = { title: 'Accesso sospeso' };

/** Blocco accessi attivo: il login resta valido e riprende quando l'amministratore lo toglie. */
export default async function SuspendedPage() {
  if (!(await isSessionSuspended())) redirect('/pazienti');

  return (
    <AuthCard
      title="Accesso temporaneamente sospeso"
      description="Un amministratore ha sospeso per il momento l’accesso all’applicazione. Non devi fare nulla: il tuo login resta valido e, quando l’accesso sarà ripristinato, potrai continuare senza rientrare."
      footer={
        <form action={logoutAction}>
          <Button type="submit" variant="link" size="sm">
            Esci
          </Button>
        </form>
      }
    >
      <Button asChild className="w-full">
        <Link href="/pazienti">Riprova</Link>
      </Button>
    </AuthCard>
  );
}
