'use client';

import { Check, ChevronDown } from 'lucide-react';
import { useId, useState, type KeyboardEvent } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface OptionInputProps {
  id: string;
  value: string;
  options: string[];
  /** Nome dell'elenco per chi usa un lettore di schermo ("Dosaggi disponibili"). */
  listLabel: string;
  invalid?: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
}

/**
 * Campo di testo con un elenco di scelte: la freccia a destra (visibile solo se ci sono scelte)
 * apre l'elenco completo, sempre con tutte le voci. Si può comunque scrivere un valore libero.
 */
export function OptionInput({ id, value, options, listLabel, invalid, placeholder, onChange }: OptionInputProps) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const hasOptions = options.length > 0;
  const showList = open && hasOptions;
  const selected = options.findIndex((o) => o.toLowerCase() === value.trim().toLowerCase());

  function show() {
    setActive(selected);
    setOpen(true);
  }

  function pick(option: string) {
    onChange(option);
    setOpen(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!hasOptions) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) return show();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (i + step + options.length) % options.length);
    } else if (e.key === 'Enter' && showList && active >= 0) {
      e.preventDefault();
      pick(options[active]!);
    } else if (e.key === 'Escape' && showList) {
      e.stopPropagation(); // chiude l'elenco, non il dialog
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <Input
        id={id}
        name={id}
        value={value}
        autoComplete="off"
        placeholder={placeholder}
        className={cn(hasOptions && 'pr-9')}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
        aria-invalid={invalid || undefined}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(false);
        }}
        onClick={show}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
      />
      {hasOptions && (
        <button
          type="button"
          tabIndex={-1}
          aria-label={open ? 'Chiudi l’elenco' : 'Apri l’elenco'}
          className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground hover:text-foreground"
          // mousedown: il campo non perde il fuoco (altrimenti l'elenco si richiuderebbe subito).
          onMouseDown={(e) => {
            e.preventDefault();
            document.getElementById(id)?.focus();
            if (open) setOpen(false);
            else show();
          }}
        >
          <ChevronDown className={cn('size-4 transition-transform', showList && 'rotate-180')} />
        </button>
      )}
      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label={listLabel}
          className="absolute inset-x-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {options.map((o, i) => (
            <li
              key={o}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === selected}
              className={cn('flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm', i === active ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60')}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(o);
              }}
            >
              <span>{o}</span>
              {i === selected && <Check className="size-4 shrink-0" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
