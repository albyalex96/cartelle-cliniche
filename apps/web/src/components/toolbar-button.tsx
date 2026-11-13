'use client';

import type { LucideIcon } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/** Bottone di una barra degli strumenti: icona, descrizione nel tooltip, stato premuto. */
export function ToolbarButton({
  label,
  icon: Icon,
  pressed,
  children,
  ...props
}: { label: string; icon: LucideIcon; pressed?: boolean; children?: ReactNode } & Omit<ComponentProps<typeof Button>, 'children'>) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant={pressed ? 'default' : 'ghost'} size={children ? 'sm' : 'icon-sm'} aria-label={label} aria-pressed={pressed} {...props}>
          <Icon />
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

export const ToolbarDivider = () => <span className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden />;
