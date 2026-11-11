'use client';

import { Search, X } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';
import { Spinner } from '@/components/ui/spinner';

/**
 * Unica parte client dell'elenco pazienti: aggiorna `?q=` nell'indirizzo
 * e il server rigenera l'elenco filtrato.
 */
export function PatientSearch({ defaultValue }: { defaultValue: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [value, setValue] = useState(defaultValue);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  function update(next: string) {
    setValue(next);
    clearTimeout(timer.current);
    // Piccola attesa mentre si digita, per non fare una richiesta a ogni tasto.
    timer.current = setTimeout(() => {
      const q = next.trim();
      startTransition(() => router.replace(q ? `${pathname}?q=${encodeURIComponent(q)}` : pathname, { scroll: false }));
    }, 250);
  }

  return (
    <InputGroup className="max-w-md">
      <InputGroupAddon>{pending ? <Spinner /> : <Search />}</InputGroupAddon>
      <InputGroupInput
        type="search"
        placeholder="Cerca per nome, cognome o codice fiscale…"
        value={value}
        onChange={(e) => update(e.target.value)}
        aria-label="Cerca pazienti"
      />
      {value && (
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="icon-xs" aria-label="Cancella ricerca" onClick={() => update('')}>
            <X />
          </InputGroupButton>
        </InputGroupAddon>
      )}
    </InputGroup>
  );
}
