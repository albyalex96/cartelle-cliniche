import { CalendarClock, CalendarOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/** Stato dell'aggiornamento automatico di un elenco pubblico: verde se attivo, giallo se disattivato. */
export function AutoUpdateBadge({ enabled, className }: { enabled: boolean; className?: string }) {
  const Icon = enabled ? CalendarClock : CalendarOff;
  return (
    <Badge
      className={cn(
        enabled
          ? 'border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200'
          : 'border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200',
        className,
      )}
    >
      <Icon />
      {enabled ? 'Aggiornamento automatico attivo' : 'Aggiornamento automatico disattivato'}
    </Badge>
  );
}
