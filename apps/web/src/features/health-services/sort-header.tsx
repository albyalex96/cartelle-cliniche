import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

/**
 * Intestazione di colonna su cui cliccare per ordinare l'elenco (un link: l'elenco lo riordina il server).
 * `direction` è il verso in uso se l'elenco è ordinato per questa colonna, altrimenti null.
 */
export function SortHeader({ label, href, direction, alignEnd }: { label: string; href: string; direction: 'asc' | 'desc' | null; alignEnd?: boolean }) {
  const Icon = direction === 'asc' ? ArrowUp : direction === 'desc' ? ArrowDown : ArrowUpDown;
  const next = direction === 'asc' ? 'decrescente' : 'crescente';
  return (
    <Link
      href={href}
      scroll={false}
      title={`Ordina per ${label.toLowerCase()} (${next})`}
      className={cn('group inline-flex items-center gap-1.5 rounded-sm hover:text-foreground', alignEnd && 'flex-row-reverse', direction && 'text-foreground')}
    >
      {label}
      <Icon className={cn('size-3.5', direction ? 'text-primary' : 'text-muted-foreground/60 group-hover:text-muted-foreground')} aria-hidden />
    </Link>
  );
}
