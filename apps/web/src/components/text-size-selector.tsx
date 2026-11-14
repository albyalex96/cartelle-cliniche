'use client';

import { useState } from 'react';
import { TEXT_SIZE_COOKIE, TEXT_SIZES, type TextSize } from '@/lib/text-size';
import { cn } from '@/lib/utils';

export function TextSizeSelector({ initial }: { initial: TextSize }) {
  const [size, setSize] = useState(initial);

  function choose(value: TextSize) {
    setSize(value);
    // Applicata subito alla pagina; il cookie la fa ritrovare al server alle visite successive.
    document.documentElement.dataset.textSize = value;
    document.cookie = `${TEXT_SIZE_COOKIE}=${value}; path=/; max-age=31536000; SameSite=Lax`;
  }

  return (
    <div className="grid max-w-md grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Dimensione del testo">
      {TEXT_SIZES.map((s) => {
        const active = size === s.value;
        return (
          <button
            key={s.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => choose(s.value)}
            className={cn(
              'flex flex-col items-center gap-1 rounded-lg border p-3 text-sm transition-colors hover:bg-muted',
              active && 'border-primary bg-primary/5 text-primary',
            )}
          >
            <span className={cn('font-semibold leading-none', s.sample)}>Aa</span>
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
