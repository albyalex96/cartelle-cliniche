'use client';

import type { DrugSuggestionDTO } from '@alby/shared';
import { Search } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { searchDrugsAction } from '@/server/actions/medications';

interface DrugSearchInputProps {
  id: string;
  value: string;
  invalid?: boolean;
  autoFocus?: boolean;
  /** Testo scritto a mano (il farmaco non è più quello scelto dall'elenco). */
  onType: (value: string) => void;
  onPick: (drug: DrugSuggestionDTO) => void;
}

/**
 * Campo "Farmaco" con suggerimenti dall'elenco AIFA (nome commerciale o principio attivo).
 * Si può sempre scrivere un nome libero: l'elenco è solo un aiuto.
 */
export function DrugSearchInput({ id, value, invalid, autoFocus, onType, onPick }: DrugSearchInputProps) {
  const listId = useId();
  const [items, setItems] = useState<DrugSuggestionDTO[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  // Si cerca solo dopo che l'utente ha scritto (non quando il form si apre già compilato).
  const [query, setQuery] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (query === null) return;
    const q = query.trim();
    if (q.length < 2) {
      setItems([]);
      setNotice(null);
      setLoading(false);
      return;
    }
    const n = ++seq.current;
    setLoading(true);
    const timer = setTimeout(async () => {
      const result = await searchDrugsAction(q);
      if (n !== seq.current) return; // è arrivata una ricerca più recente
      setLoading(false);
      setActive(-1);
      if (!result.ok) {
        setItems([]);
        setNotice(result.message);
      } else {
        setItems(result.data.items);
        setNotice(
          !result.data.catalogReady
            ? 'L’elenco dei farmaci AIFA non è ancora stato importato: scrivi il nome a mano.'
            : result.data.items.length === 0
              ? 'Nessun farmaco trovato: puoi comunque scrivere il nome a mano.'
              : null,
        );
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  function pick(drug: DrugSuggestionDTO) {
    onPick(drug);
    setOpen(false);
    setItems([]);
    setQuery(null);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open || items.length === 0) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (i + step + items.length) % items.length);
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      pick(items[active]!);
    } else if (e.key === 'Escape') {
      e.stopPropagation(); // chiude i suggerimenti, non il dialog
      setOpen(false);
    }
  }

  const showList = open && (items.length > 0 || !!notice);

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        id={id}
        name={id}
        value={value}
        autoFocus={autoFocus}
        autoComplete="off"
        placeholder="Nome commerciale o principio attivo"
        className="pr-8 pl-8"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        aria-invalid={invalid || undefined}
        onChange={(e) => {
          onType(e.target.value);
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
      />
      {loading && <Spinner className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground" />}
      {showList && (
        <div className="absolute inset-x-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-md">
          {notice && <p className="px-2 py-1.5 text-sm text-muted-foreground">{notice}</p>}
          <ul id={listId} role="listbox" aria-label="Farmaci trovati">
            {items.map((d, i) => (
              <li
                key={d.aic}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={cn('grid cursor-pointer gap-0.5 rounded-md px-2 py-1.5 text-sm', i === active ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60')}
                // mousedown: scatta prima del blur del campo.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(d);
                }}
              >
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium">{d.name}</span>
                  {d.activeIngredient && <span className="text-muted-foreground">· {d.activeIngredient}</span>}
                  {d.withdrawn && (
                    <Badge variant="outline" className="h-5 text-[11px]">
                      Non più in commercio
                    </Badge>
                  )}
                </span>
                <span className="truncate text-xs text-muted-foreground">{[d.forms.join(', '), d.packages[0]].filter(Boolean).join(' — ')}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
