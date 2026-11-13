'use client';

import { useEffect, useRef } from 'react';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DiscImportDialog } from '@/features/imaging/disc-import-dialog';
import { previewUrl } from '@/features/imaging/preview-url';
import { cn } from '@/lib/utils';
import type { ReportImaging } from './report-imaging';

/**
 * Sezione "Immagini" del form del referto: si scelgono gli studi del paziente da collegare
 * e se ne possono caricare di nuovi da CD/DVD. Il collegamento viene salvato insieme al referto.
 */
export function ReportImagesField({
  imaging,
  selected,
  onChange,
  disabled,
  showDiscImport = true,
}: {
  imaging: ReportImaging;
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  /** Bottone "Leggi CD/DVD" (nel modal "Inserisci referto" sta già in alto). */
  showDiscImport?: boolean;
}) {
  // Gli studi appena caricati dal CD (comparsi dopo l'apertura del form) vengono selezionati da soli.
  const known = useRef(new Set(imaging.studies.map((s) => s.id)));
  useEffect(() => {
    const fresh = imaging.studies.filter((s) => !known.current.has(s.id)).map((s) => s.id);
    if (!fresh.length) return;
    for (const id of fresh) known.current.add(id);
    onChange([...new Set([...selected, ...fresh])]);
    // Reagisce solo all'elenco che arriva dal server.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imaging.studies]);

  const toggle = (id: string, checked: boolean) => onChange(checked ? [...selected, id] : selected.filter((x) => x !== id));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Immagini</CardTitle>
        <CardDescription>
          {imaging.studies.length
            ? 'Scegli le immagini dell’esame a cui si riferisce questo referto, oppure caricale dal CD/DVD. Il collegamento viene salvato con il referto.'
            : 'Se hai il CD/DVD dell’esame puoi caricare qui le immagini: restano collegate a questo referto.'}
        </CardDescription>
        {showDiscImport && (
          <CardAction>
            <DiscImportDialog patient={imaging.patient} canEdit imagesOnly />
          </CardAction>
        )}
      </CardHeader>
      {imaging.studies.length > 0 && (
        <CardContent>
          <ul className="grid gap-2">
            {imaging.studies.map((s) => {
              const checked = selected.includes(s.id);
              return (
                <li key={s.id}>
                  <label
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-lg border p-2 transition-colors hover:bg-muted/50',
                      checked && 'border-primary/50 bg-primary/5',
                    )}
                  >
                    <input
                      type="checkbox"
                      className="size-4 shrink-0 accent-primary"
                      checked={checked}
                      disabled={disabled}
                      onChange={(e) => toggle(s.id, e.target.checked)}
                    />
                    <span className="block size-12 shrink-0 overflow-hidden rounded-md bg-black">
                      {s.coverInstanceId && (
                        <img src={previewUrl(s.coverInstanceId, 'thumb')} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
                      )}
                    </span>
                    <span className="grid min-w-0 gap-0.5">
                      <span className="truncate text-sm font-medium">{s.title}</span>
                      <span className="text-xs text-muted-foreground">{s.caption}</span>
                      {s.linkedElsewhere && (
                        <span className="text-xs text-muted-foreground">
                          {checked ? 'Era collegato a un altro referto: salvando passa a questo.' : 'Già collegato a un altro referto.'}
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </CardContent>
      )}
    </Card>
  );
}
