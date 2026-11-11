import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthCard } from '@/components/auth-card';
import { Button } from '@/components/ui/button';
import { ChangePasswordForm } from '@/features/auth/change-password-form';
import { logoutAction } from '@/server/actions/auth';
import { getRequestContext } from '@/server/context';

export const metadata: Metadata = { title: 'Nuova password' };

/** Primo accesso con una password impostata dall'amministratore. */
export default async function ForcePasswordPage() {
  const { user } = await getRequestContext();
  if (!user) redirect('/login');
  if (!user.mustChangePassword) redirect('/pazienti');

  return (
    <AuthCard
      title={`Ciao ${user.displayName.split(' ')[0]}`}
      description="Per sicurezza, scegli una password personale prima di continuare. Come “password attuale” usa quella che ti è stata comunicata."
      footer={
        <form action={logoutAction}>
          <Button type="submit" variant="link" size="sm">
            Esci
          </Button>
        </form>
      }
    >
      <ChangePasswordForm submitLabel="Salva e continua" redirectTo="/pazienti" />
    </AuthCard>
  );
}
