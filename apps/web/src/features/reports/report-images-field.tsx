'use client';

import { MAX_IMAGE_BYTES } from '@alby/shared';
import { Crop, ImageUp, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useTransition, type ChangeEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Spinner } from '@/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { DiscImportDialog } from '@/features/imaging/disc-import-dialog';
import { previewUrl } from '@/features/imaging/preview-url';
import { cn } from '@/lib/utils';
import { addReportImageAction, cropReportImageAction } from '@/server/actions/reports';
import type { ReportImaging } from './report-imaging';
import { useScanBridge } from './scan-bridge';

/**
 * Sezione "Immagini" del form del referto: si scelgono gli studi del paziente da collegare e se ne
 * aggiungono di nuovi dal CD/DVD, da una foto o ritagliando una zona del PDF accanto al form.
 * Le immagini aggiunte diventano studi del paziente; il collegamento viene salvato insieme al referto.
 */
export function ReportImagesField({
  imaging,
  selected,
  onChange,
  disabled,
  studyDate,
}: {
  imaging: ReportImaging;
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  /** Data dell'esame scritta nel form: diventa la data delle immagini aggiunte. */
  studyDate?: string;
}) {
  const router = useRouter();
  const bridge = useScanBridge();
  const patientId = imaging.patient.id;
  const input = useRef<HTMLInputElement>(null);
  const [uploading, startUpload] = useTransition();

  /** Dopo il salvataggio la pagina si aggiorna: il nuovo studio compare qui e viene spuntato da solo. */
  const added = (what: string) => {
    toast.success(`${what} aggiunta alle immagini del referto`);
    router.refresh();
  };

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // permette di riscegliere lo stesso file
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error(`L’immagine supera i ${MAX_IMAGE_BYTES / 1024 / 1024} MB`);
      return;
    }
    const data = new FormData();
    data.set('file', file);
    if (studyDate) data.set('studyDate', studyDate);
    startUpload(async () => {
      const result = await addReportImageAction(patientId, data);
      if (!result.ok) toast.error(result.message);
      else added('Immagine');
    });
  }

  // Ritagli dal documento accanto al form (selezionati nel visualizzatore).
  const setCropHandler = bridge?.setCropHandler;
  useEffect(() => {
    setCropHandler?.(async (fileId, page, region) => {
      const result = await cropReportImageAction(patientId, { fileId, page, region, studyDate: studyDate ?? '' });
      if (!result.ok) toast.error(result.message);
      else added('Ritaglio');
    });
    return () => setCropHandler?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setCropHandler, patientId, studyDate]);

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
            ? 'Scegli le immagini dell’esame a cui si riferisce questo referto, oppure aggiungine dal CD/DVD, da una foto o ritagliandole dal PDF. Il collegamento viene salvato con il referto.'
            : 'Puoi aggiungere le immagini dell’esame dal CD/DVD, da una foto o ritagliandole dal PDF: restano collegate a questo referto.'}
        </CardDescription>
        <CardAction className="flex flex-wrap justify-end gap-1.5">
          <DiscImportDialog patient={imaging.patient} canEdit imagesOnly />
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" className="sr-only" tabIndex={-1} onChange={onFile} />
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="icon" aria-label="Aggiungi immagine" disabled={disabled || uploading}>
                    {uploading ? <Spinner /> : <Plus />}
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>Aggiungi immagine</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => input.current?.click()}>
                <ImageUp />
                Carica immagine
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!bridge?.pdfReady} onSelect={() => bridge?.startSelection({ kind: 'crop' })}>
                <Crop />
                <span className="grid">
                  Ritaglia dal PDF
                  {!bridge?.pdfReady && <span className="text-xs text-muted-foreground">Prima carica il PDF del referto</span>}
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardAction>
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
