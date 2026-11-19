'use client';

import { Check, Copy, Download, FileJson } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

/**
 * Esporta uno o più tipi di referto in JSON (preparato dal server): scarica il file .json o copia il codice.
 * `compact`: solo l'icona, per le righe della tabella.
 */
export function ExportTemplatesMenu({ json, fileName, label, compact }: { json: string; fileName: string; label: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);

  function download() {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      toast.success('Codice copiato: incollalo in «Importa» su un altro server');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Non riesco a copiare: scarica il file .json');
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {compact ? (
          <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-foreground" aria-label={label} title="Esporta">
            <FileJson />
          </Button>
        ) : (
          <Button variant="outline">
            <FileJson />
            {label}
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={download}>
          <Download />
          Scarica file .json
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void copy()}>
          {copied ? <Check /> : <Copy />}
          Copia il codice
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
