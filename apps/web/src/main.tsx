import { QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import { ThemeProvider } from 'next-themes';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { queryClient } from '@/lib/query';
import { router } from '@/router';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        {/* Rispetta l'impostazione "riduci movimento" del sistema operativo. */}
        <MotionConfig reducedMotion="user">
          <TooltipProvider delayDuration={300}>
            <RouterProvider router={router} />
            <Toaster position="top-right" richColors closeButton />
          </TooltipProvider>
        </MotionConfig>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
