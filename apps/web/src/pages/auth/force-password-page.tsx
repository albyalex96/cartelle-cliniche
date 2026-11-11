import { ChangePasswordForm } from '@/components/change-password-form';
import { Button } from '@/components/ui/button';
import { useLogout, useMe } from '@/hooks/use-session';
import { AuthLayout } from './auth-layout';

/** Mostrata al primo accesso con una password impostata dall'amministratore. */
export default function ForcePasswordPage() {
  const me = useMe();
  const logout = useLogout();
  return (
    <AuthLayout
      title={`Ciao ${me.displayName.split(' ')[0]}`}
      description="Per sicurezza, scegli una password personale prima di continuare. Come “password attuale” usa quella che ti è stata comunicata."
      footer={
        <Button variant="link" size="sm" onClick={() => logout.mutate()}>
          Esci
        </Button>
      }
    >
      <ChangePasswordForm submitLabel="Salva e continua" />
    </AuthLayout>
  );
}
