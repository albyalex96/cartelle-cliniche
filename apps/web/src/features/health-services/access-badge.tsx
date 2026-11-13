import { Repeat, UserPlus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/** Tipo di accesso di una prestazione, ben visibile: "Primo accesso" (blu) oppure "Controllo" (ambra). */
export function AccessBadge({ type, className }: { type: 'P' | 'C'; className?: string }) {
  const first = type === 'P';
  const Icon = first ? UserPlus : Repeat;
  return (
    <Badge
      className={cn(
        'font-semibold',
        first
          ? 'border-blue-300 bg-blue-100 text-blue-900 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-200'
          : 'border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200',
        className,
      )}
    >
      <Icon />
      {first ? 'Primo accesso' : 'Controllo'}
    </Badge>
  );
}
