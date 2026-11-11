import type { ReactNode } from 'react';
import { FadeIn } from '@/components/fade-in';
import { Logo } from '@/components/logo';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-svh items-center justify-center overflow-hidden bg-muted/40 p-4">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 size-[36rem] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl"
      />
      <FadeIn className="relative flex w-full max-w-sm flex-col gap-6">
        <Logo className="justify-center" />
        {children}
      </FadeIn>
    </div>
  );
}
