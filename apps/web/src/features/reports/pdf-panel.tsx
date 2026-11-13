import type { StoredFileDTO } from '@alby/shared';
import { Download, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Il PDF originale, mostrato dal visualizzatore del browser (Server Component, nessun JavaScript).
 * Su schermi grandi resta fisso accanto al contenuto mentre si scorre; sui telefoni c'è solo il link.
 */
export function PdfPanel({ file, className }: { file: StoredFileDTO; className?: string }) {
  const src = `/api/files/${file.id}`;
  return (
    <aside className={cn('grid gap-2 lg:sticky lg:top-4 lg:self-start', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm text-muted-foreground" title={file.fileName}>
          {file.fileName}
        </p>
        <div className="flex shrink-0 gap-1">
          <Button variant="ghost" size="sm" asChild>
            <a href={src} target="_blank" rel="noopener">
              <ExternalLink />
              Apri
            </a>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <a href={`${src}?download=1`} download>
              <Download />
              Scarica
            </a>
          </Button>
        </div>
      </div>
      <iframe
        src={`${src}#view=FitH`}
        title={`PDF: ${file.fileName}`}
        className="hidden h-[calc(100svh-var(--viewer-offset,7rem))] w-full rounded-xl border bg-muted lg:block"
      />
    </aside>
  );
}
