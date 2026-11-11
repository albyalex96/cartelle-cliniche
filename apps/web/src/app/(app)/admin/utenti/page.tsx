import { listPatients, listUsers } from '@alby/core';
import { ROLE_LABELS } from '@alby/shared';
import { Pencil } from 'lucide-react';
import type { Metadata } from 'next';
import { Page, PageHeader } from '@/components/page';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { NewUserButton, UserRowActions } from '@/features/users/user-actions';
import { formatDateTime, formatRelative, initials } from '@/lib/format';
import { cn } from '@/lib/utils';
import { requirePageAdmin } from '@/server/context';

export const metadata: Metadata = { title: 'Utenti' };

export default async function UsersPage() {
  const ctx = await requirePageAdmin();
  const [users, patients] = await Promise.all([listUsers(ctx), listPatients(ctx)]);
  // Al client arrivano solo i dati necessari per scegliere gli accessi, non le schede complete.
  const patientOptions = patients.map(({ id, firstName, lastName }) => ({ id, firstName, lastName }));

  return (
    <Page>
      <PageHeader
        title="Utenti"
        description="Chi può accedere all’archivio e quali pazienti può vedere."
        actions={<NewUserButton patients={patientOptions} />}
      />

      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Utente</TableHead>
              <TableHead>Ruolo</TableHead>
              <TableHead className="hidden md:table-cell">Pazienti visibili</TableHead>
              <TableHead className="hidden sm:table-cell">Ultimo accesso</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id} className={cn(!u.active && 'opacity-55')}>
                <TableCell className="pl-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="size-8">
                      <AvatarFallback className="text-xs">{initials(...u.displayName.split(' '))}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 font-medium">
                        <span className="truncate">{u.displayName}</span>
                        {u.id === ctx.user.id && <Badge variant="secondary">Tu</Badge>}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">{u.email}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant={u.role === 'ADMIN' ? 'default' : 'outline'}>{ROLE_LABELS[u.role]}</Badge>
                    {!u.active && <Badge variant="destructive">Disattivato</Badge>}
                    {u.active && u.mustChangePassword && <Badge variant="secondary">Password da cambiare</Badge>}
                  </div>
                </TableCell>
                <TableCell className="hidden max-w-xs md:table-cell">
                  {u.role === 'ADMIN' ? (
                    <span className="text-sm text-muted-foreground">Tutti</span>
                  ) : u.access.length === 0 ? (
                    <span className="text-sm text-muted-foreground">Nessuno</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {u.access.map((a) => (
                        <Badge key={a.patientId} variant="secondary" title={a.canEdit ? 'Lettura e modifica' : 'Sola lettura'}>
                          {a.patientName}
                          {a.canEdit && <Pencil className="size-3" />}
                        </Badge>
                      ))}
                    </div>
                  )}
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground sm:table-cell" title={formatDateTime(u.lastLoginAt)}>
                  {formatRelative(u.lastLoginAt)}
                </TableCell>
                <TableCell className="pr-4">
                  <UserRowActions user={u} isSelf={u.id === ctx.user.id} patients={patientOptions} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </Page>
  );
}
