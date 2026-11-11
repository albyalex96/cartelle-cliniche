import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Contenitore di pagina con una breve animazione d'ingresso. */
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={cn('mx-auto flex w-full max-w-6xl flex-col gap-6', className)}
    >
      {children}
    </motion.div>
  );
}

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  leading?: ReactNode;
}

export function PageHeader({ title, description, actions, leading }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 items-center gap-4">
        {leading}
        <div className="min-w-0">
          <h1 className="truncate font-heading text-2xl font-semibold tracking-tight">{title}</h1>
          {description && <div className="mt-1 text-sm text-muted-foreground">{description}</div>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
