'use client';

import { AUDIT_FILTERS } from '@alby/shared';
import { X } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';

export interface AuditFilterValues {
  tipo: string;
  utente: string;
  dal: string;
  al: string;
}

/** Selettori del registro: tipo di attività, autore e intervallo di date (nei parametri dell'URL). */
export function AuditFilter({ value, users }: { value: AuditFilterValues; users: { id: string; name: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  const apply = (patch: Partial<AuditFilterValues>) => {
    const next = { ...value, ...patch };
    const params = new URLSearchParams();
    if (next.tipo !== 'all') params.set('tipo', next.tipo);
    if (next.utente !== 'all') params.set('utente', next.utente);
    if (next.dal) params.set('dal', next.dal);
    if (next.al) params.set('al', next.al);
    const qs = params.toString();
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname));
  };
  const active = value.tipo !== 'all' || value.utente !== 'all' || value.dal || value.al;

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {pending && <Spinner className="text-muted-foreground" />}
      <Select value={value.tipo} onValueChange={(tipo) => apply({ tipo })}>
        <SelectTrigger className="w-48" aria-label="Filtra per attività">
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          {AUDIT_FILTERS.map((f) => (
            <SelectItem key={f.value} value={f.value}>
              {f.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={value.utente} onValueChange={(utente) => apply({ utente })}>
        <SelectTrigger className="w-44" aria-label="Filtra per autore">
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          <SelectItem value="all">Tutti gli utenti</SelectItem>
          {users.map((u) => (
            <SelectItem key={u.id} value={u.id}>
              {u.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        type="date"
        className="w-38"
        aria-label="Dal giorno"
        value={value.dal}
        max={value.al || undefined}
        onChange={(e) => apply({ dal: e.target.value })}
      />
      <Input
        type="date"
        className="w-38"
        aria-label="Al giorno"
        value={value.al}
        min={value.dal || undefined}
        onChange={(e) => apply({ al: e.target.value })}
      />
      {active && (
        <Button variant="ghost" size="icon" aria-label="Azzera filtri" onClick={() => apply({ tipo: 'all', utente: 'all', dal: '', al: '' })}>
          <X />
        </Button>
      )}
    </div>
  );
}
