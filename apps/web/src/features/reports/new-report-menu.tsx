'use client';

import type { ReportKind } from '@alby/shared';
import { FileText, FlaskConical, Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { NewReportDialog } from './new-report-dialog';
import type { ReportImaging } from './report-imaging';

/** Bottone "+" (Inserisci referto): si sceglie il tipo e si apre il modal con il tipo già impostato. */
export function NewReportMenu({ imaging }: { imaging: ReportImaging }) {
  const [kind, setKind] = useState<ReportKind | null>(null);
  // Ogni apertura parte da un form nuovo.
  const [session, setSession] = useState(0);
  const open = (k: ReportKind) => {
    setSession((n) => n + 1);
    setKind(k);
  };

  return (
    <>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button size="icon" aria-label="Inserisci referto">
                <Plus />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Inserisci referto</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => open('LABORATORIO')}>
            <FlaskConical />
            Esami di laboratorio
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => open('DESCRITTIVO')}>
            <FileText />
            Referto descrittivo
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {kind && <NewReportDialog key={session} kind={kind} imaging={imaging} open onOpenChange={(o) => !o && setKind(null)} />}
    </>
  );
}
