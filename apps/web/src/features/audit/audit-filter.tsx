'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { AUDIT_FILTERS } from './filters';

export function AuditFilter({ value }: { value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex items-center gap-2">
      {pending && <Spinner className="text-muted-foreground" />}
      <Select
        value={value}
        onValueChange={(v) => startTransition(() => router.push(v === 'all' ? pathname : `${pathname}?tipo=${v}`))}
      >
        <SelectTrigger className="w-52" aria-label="Filtra attività">
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
    </div>
  );
}
