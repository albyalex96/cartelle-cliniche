import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { Logo } from '@/components/logo';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface AuthLayoutProps {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

export function AuthLayout({ title, description, children, footer }: AuthLayoutProps) {
  return (
    <div className="relative flex min-h-svh items-center justify-center overflow-hidden bg-muted/40 p-4">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 size-[36rem] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl"
      />
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="relative flex w-full max-w-sm flex-col gap-6"
      >
        <Logo className="justify-center" />
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{title}</CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
        {footer && <div className="text-center text-xs text-muted-foreground">{footer}</div>}
      </motion.div>
    </div>
  );
}
