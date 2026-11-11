import { ROLE_LABELS, type UserDTO } from '@alby/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, MoreHorizontal, Pencil, Plus, Power, PowerOff } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Page, PageHeader } from '@/components/page';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useMe } from '@/hooks/use-session';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime, formatRelative, initials } from '@/lib/format';
import { queryKeys } from '@/lib/query';
import { cn } from '@/lib/utils';
import { ResetPasswordDialog } from './reset-password-dialog';
import { UserFormDialog } from './user-form-dialog';

function useToggleActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (u: UserDTO) => api.patch<UserDTO>(`/users/${u.id}`, { active: !u.active }),
    onMutate: async (u) => {
      await qc.cancelQueries({ queryKey: queryKeys.users });
      const previous = qc.getQueryData<UserDTO[]>(queryKeys.users);
      qc.setQueryData<UserDTO[]>(queryKeys.users, (list) =>
        list?.map((x) => (x.id === u.id ? { ...x, active: !u.active } : x)),
      );
      return { previous };
    },
    onError: (err, _u, ctx) => {
      qc.setQueryData(queryKeys.users, ctx?.previous);
      toast.error(errorMessage(err));
    },
    onSuccess: (u) => toast.success(u.active ? `${u.displayName} riattivato` : `${u.displayName} disattivato`),
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.users }),
  });
}

export default function UsersPage() {
  const me = useMe();
  const [editing, setEditing] = useState<UserDTO | 'new' | null>(null);
  const [resetting, setResetting] = useState<UserDTO | null>(null);
  const toggle = useToggleActive();

  const { data: users, isPending } = useQuery({
    queryKey: queryKeys.users,
    queryFn: () => api.get<UserDTO[]>('/users'),
  });

  return (
    <Page>
      <PageHeader
        title="Utenti"
        description="Chi può accedere all’archivio e quali pazienti può vedere."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus />
            Nuovo utente
          </Button>
        }
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
            {isPending
              ? Array.from({ length: 3 }, (_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={5} className="px-4">
                      <Skeleton className="h-9" />
                    </TableCell>
                  </TableRow>
                ))
              : users?.map((u) => (
                  <TableRow key={u.id} className={cn(!u.active && 'opacity-55')}>
                    <TableCell className="pl-4">
                      <div className="flex items-center gap-3">
                        <Avatar className="size-8">
                          <AvatarFallback className="text-xs">{initials(...u.displayName.split(' '))}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 font-medium">
                            <span className="truncate">{u.displayName}</span>
                            {u.id === me.id && <Badge variant="secondary">Tu</Badge>}
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
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={`Azioni per ${u.displayName}`}>
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setEditing(u)}>
                            <Pencil />
                            Modifica
                          </DropdownMenuItem>
                          {u.id !== me.id && (
                            <>
                              <DropdownMenuItem onSelect={() => setResetting(u)}>
                                <KeyRound />
                                Reimposta password
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                variant={u.active ? 'destructive' : 'default'}
                                onSelect={() => toggle.mutate(u)}
                              >
                                {u.active ? <PowerOff /> : <Power />}
                                {u.active ? 'Disattiva' : 'Riattiva'}
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </Card>

      <UserFormDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        user={editing === 'new' || editing === null ? undefined : editing}
      />
      <ResetPasswordDialog user={resetting} onClose={() => setResetting(null)} />
    </Page>
  );
}
