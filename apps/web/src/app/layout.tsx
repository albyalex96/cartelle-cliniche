import type { Metadata, Viewport } from 'next';
import { cookies, headers } from 'next/headers';
import type { ReactNode } from 'react';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ACCENT_COOKIE, parseAccent } from '@/lib/accent';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Cartelle Cliniche', template: '%s · Cartelle Cliniche' },
  description: 'Archivio dei dati medici di famiglia',
  // Dati privati: niente indicizzazione.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Nonce della Content Security Policy (generato in proxy.ts) per lo script del tema.
  const [hdrs, jar] = await Promise.all([headers(), cookies()]);
  const nonce = hdrs.get('x-nonce') ?? undefined;
  const accent = parseAccent(jar.get(ACCENT_COOKIE)?.value);
  return (
    <html lang="it" data-accent={accent} suppressHydrationWarning>
      <body className="min-h-svh antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange nonce={nonce}>
          <TooltipProvider delayDuration={300}>
            {children}
            <Toaster position="top-right" richColors closeButton />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
