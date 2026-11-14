'use client';

import { hasLabTable, type ReportTemplateDTO } from '@alby/shared';
import { FileText, FlaskConical, Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { NewReportDialog } from './new-report-dialog';
import type { ReportImaging } from './report-imaging';

/** Bottone "+" (Inserisci referto): si sceglie il tipo e si apre il modal con il tipo già impostato. */
export function NewReportMenu({ imaging, templates }: { imaging: ReportImaging; templates: ReportTemplateDTO[] }) {
  const [chosen, setChosen] = useState<ReportTemplateDTO | null>(null);
  // Ogni apertura parte da un form nuovo.
  const [session, setSession] = useState(0);
  const open = (t: ReportTemplateDTO) => {
    setSession((n) => n + 1);
    setChosen(t);
  };

  return (
    <>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button size="icon" aria-label="Inserisci referto" disabled={templates.length === 0}>
                <Plus />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Inserisci referto</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end">
          {templates.map((t) => {
            const Icon = hasLabTable(t.fields) ? FlaskConical : FileText;
            return (
              <DropdownMenuItem key={t.id} onSelect={() => open(t)}>
                <Icon />
                {t.name}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      {chosen && <NewReportDialog key={session} template={chosen} templates={templates} imaging={imaging} open onOpenChange={(o) => !o && setChosen(null)} />}
    </>
  );
}
