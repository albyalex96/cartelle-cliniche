import { ROLE_LABELS } from '@alby/shared';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { ChangePasswordForm } from '@/components/change-password-form';
import { Page, PageHeader } from '@/components/page';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useMe } from '@/hooks/use-session';
import { initials } from '@/lib/format';
import { cn } from '@/lib/utils';

const THEMES = [
  { value: 'light', label: 'Chiaro', icon: Sun },
  { value: 'dark', label: 'Scuro', icon: Moon },
  { value: 'system', label: 'Automatico', icon: Monitor },
] as const;

export default function ProfilePage() {
  const me = useMe();
  const { theme, setTheme } = useTheme();

  return (
    <Page className="max-w-3xl">
      <PageHeader
        leading={
          <Avatar className="size-14">
            <AvatarFallback className="bg-primary/10 text-lg text-primary">{initials(...me.displayName.split(' '))}</AvatarFallback>
          </Avatar>
        }
        title={me.displayName}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {me.email}
            <Badge variant="outline">{ROLE_LABELS[me.role]}</Badge>
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
          <div className="grid max-w-md grid-cols-3 gap-2">
            {THEMES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTheme(t.value)}
                aria-pressed={theme === t.value}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-lg border p-3 text-sm transition-colors hover:bg-muted',
                  theme === t.value && 'border-primary bg-primary/5 text-primary',
                )}
              >
                <t.icon className="size-5" />
                {t.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </Page>
  );
}
