'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { linkStudyReportAction } from '@/server/actions/imaging';

const NONE = 'none';

/** Scelta del referto testuale collegato a uno studio di immagini (salva subito). */
export function ReportLinkSelect({ studyId, reportId, reports }: { studyId: string; reportId: string | null; reports: { id: string; label: string }[] }) {
  const [pending, startTransition] = useTransition();
  return (
    <Select
      value={reportId ?? NONE}
      disabled={pending}
      onValueChange={(value) =>
        startTransition(async () => {
          const result = await linkStudyReportAction(studyId, value === NONE ? null : value);
          if (!result.ok) toast.error(result.message);
          else toast.success(value === NONE ? 'Collegamento rimosso' : 'Referto collegato');
        })
      }
    >
      <SelectTrigger className="w-full sm:w-96" aria-label="Referto collegato">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Nessun referto collegato</SelectItem>
        {reports.map((r) => (
          <SelectItem key={r.id} value={r.id}>
            {r.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
