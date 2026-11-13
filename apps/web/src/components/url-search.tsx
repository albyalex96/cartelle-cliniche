'use client';

import { Search, X } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';
import { Spinner } from '@/components/ui/spinner';

/**
 * Campo di ricerca di un elenco generato dal server: aggiorna `?q=` nell'indirizzo
 * e il server rigenera l'elenco filtrato (ripartendo dalla prima pagina).
 * `params` sono gli altri filtri dell'elenco, da mantenere nell'indirizzo.
 */
interface UrlSearchProps {
  defaultValue: string;
  placeholder: string;
  label: string;
  params?: Record<string, string>;
}

export function UrlSearch({ defaultValue, placeholder, label, params }: UrlSearchProps) {
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
      const query = new URLSearchParams({ ...(q ? { q } : {}), ...params }).toString();
      startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
    }, 250);
  }

  return (
    <InputGroup className="max-w-md">
      <InputGroupAddon>{pending ? <Spinner /> : <Search />}</InputGroupAddon>
      <InputGroupInput type="search" placeholder={placeholder} value={value} onChange={(e) => update(e.target.value)} aria-label={label} />
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
