import { HeartPulse } from 'lucide-react';
import { cn } from '@/lib/utils';

export function LogoMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm',
        className,
      )}
    >
      <HeartPulse className="size-[55%]" />
    </div>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <LogoMark />
      <div className="grid leading-tight">
        <span className="font-heading text-sm font-semibold">Cartelle Cliniche</span>
        <span className="text-xs text-muted-foreground">Archivio di famiglia</span>
      </div>
    </div>
  );
}
