import type { ReportDraftDTO } from '@alby/shared';
import { CircleCheck, Info, TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

/** Avvisi della revisione: il PDF è del paziente giusto? Cosa non è stato trovato? (Server Component) */
export function DraftNotices({ draft }: { draft: ReportDraftDTO }) {
  const { identity, warnings, parser } = draft;
  return (
    <div className="grid gap-3">
      {identity?.status === 'mismatch' && (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>Il PDF sembra di un’altra persona</AlertTitle>
          <AlertDescription>{identity.message}</AlertDescription>
        </Alert>
      )}
      {identity?.status === 'unknown' && (
        <Alert>
          <Info />
          <AlertTitle>Controlla il paziente</AlertTitle>
          <AlertDescription>{identity.message}</AlertDescription>
        </Alert>
      )}
      {warnings.length > 0 && (
        <Alert>
          <Info />
          <AlertTitle>Da controllare</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      {identity?.status === 'ok' && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CircleCheck className="size-4 text-primary" />
          {identity.message}
          {parser && <span className="sr-only">Lettura automatica: {parser.id}</span>}
        </p>
      )}
    </div>
  );
}
