'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';

const ALL = 'tutte';

/** Filtro per branca: aggiorna `?branca=` nell'indirizzo (mantenendo gli altri filtri) e il server rigenera l'elenco. */
export function BranchFilter({ value, branches, params }: { value: string; branches: string[]; params: Record<string, string> }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex items-center gap-2">
      <Select
        value={value || ALL}
        onValueChange={(v) => {
          const query = new URLSearchParams({ ...params, ...(v === ALL ? {} : { branca: v }) }).toString();
          startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
        }}
      >
        <SelectTrigger className="w-64 max-w-full" aria-label="Filtra per branca">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Tutte le branche</SelectItem>
          {branches.map((b) => (
            <SelectItem key={b} value={b}>
              {b[0] + b.slice(1).toLowerCase()}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {pending && <Spinner className="text-muted-foreground" />}
    </div>
  );
}
