'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

const THEMES = [
  { value: 'light', label: 'Chiaro', icon: Sun },
  { value: 'dark', label: 'Scuro', icon: Moon },
  { value: 'system', label: 'Automatico', icon: Monitor },
] as const;

export function ThemeSelector() {
  const { theme, setTheme } = useTheme();
  // Il tema salvato si conosce solo nel browser: prima del montaggio nessuna voce è evidenziata.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="grid max-w-md grid-cols-3 gap-2">
      {THEMES.map((t) => {
        const active = mounted && theme === t.value;
        return (
          <button
            key={t.value}
            type="button"
            onClick={() => setTheme(t.value)}
            aria-pressed={active}
            className={cn(
              'flex flex-col items-center gap-2 rounded-lg border p-3 text-sm transition-colors hover:bg-muted',
              active && 'border-primary bg-primary/5 text-primary',
            )}
          >
            <t.icon className="size-5" />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
