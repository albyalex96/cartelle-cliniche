import { ROLE_LABELS } from '@alby/shared';
import type { Metadata } from 'next';
import { Page, PageHeader } from '@/components/page';
import { ThemeSelector } from '@/components/theme-selector';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChangePasswordForm } from '@/features/auth/change-password-form';
import { initials } from '@/lib/format';
import { requirePageUser } from '@/server/context';

export const metadata: Metadata = { title: 'Profilo' };

export default async function ProfilePage() {
  const { user } = await requirePageUser();
  return (
    <Page className="max-w-3xl">
      <PageHeader
        leading={
          <Avatar className="size-14">
            <AvatarFallback className="bg-primary/10 text-lg text-primary">{initials(...user.displayName.split(' '))}</AvatarFallback>
          </Avatar>
        }
        title={user.displayName}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {user.email}
            <Badge variant="outline">{ROLE_LABELS[user.role]}</Badge>
          </span>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>Dopo il cambio, gli altri dispositivi collegati verranno disconnessi.</CardDescription>
        </CardHeader>
        <CardContent className="max-w-md">
          <ChangePasswordForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Aspetto</CardTitle>
          <CardDescription>“Automatico” segue le impostazioni del dispositivo.</CardDescription>
        </CardHeader>
        <CardContent>
          <ThemeSelector />
        </CardContent>
      </Card>
    </Page>
  );
}
