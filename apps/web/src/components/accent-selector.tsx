'use client';

import { Check } from 'lucide-react';
import { useState } from 'react';
import { ACCENT_COOKIE, ACCENTS, type Accent } from '@/lib/accent';
import { cn } from '@/lib/utils';

export function AccentSelector({ initial }: { initial: Accent }) {
  const [accent, setAccent] = useState(initial);

  function choose(value: Accent) {
    setAccent(value);
    // Applicato subito alla pagina; il cookie lo fa ritrovare al server alle visite successive.
    document.documentElement.dataset.accent = value;
    document.cookie = `${ACCENT_COOKIE}=${value}; path=/; max-age=31536000; SameSite=Lax`;
  }

  return (
    <div className="flex flex-wrap gap-3" role="radiogroup" aria-label="Colore principale">
      {ACCENTS.map((a) => {
        const active = accent === a.value;
        return (
          <button
            key={a.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={a.label}
            title={a.label}
            onClick={() => choose(a.value)}
            className={cn(
              'flex size-9 items-center justify-center rounded-full ring-offset-2 ring-offset-background transition-shadow hover:ring-2 hover:ring-muted-foreground/40',
              active && 'ring-2 ring-foreground hover:ring-foreground',
            )}
            style={{ backgroundColor: a.swatch }}
          >
            {active && <Check className="size-4 text-white" />}
          </button>
        );
      })}
    </div>
  );
}
