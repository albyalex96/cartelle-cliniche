'use client';

import { MAX_IMAGE_BYTES } from '@alby/shared';
import { Check, Crop, Database, ImageUp, Pencil, Plus, Unlink, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition, type ChangeEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { DeleteStudyButton } from '@/features/imaging/delete-study-button';
import { DiscImportDialog } from '@/features/imaging/disc-import-dialog';
import { previewUrl } from '@/features/imaging/preview-url';
import { cn } from '@/lib/utils';
import { linkStudyReportAction, renameStudyAction } from '@/server/actions/imaging';
import { addReportImageAction, cropReportImageAction } from '@/server/actions/reports';
import type { ReportImaging } from './report-imaging';
import { useScanBridge } from './scan-bridge';

/**
 * Sezione "Immagini" del form del referto: si scelgono gli studi del paziente da collegare e se ne
 * aggiungono di nuovi dal CD/DVD, da una foto o ritagliando una zona del PDF accanto al form.
 * Le immagini aggiunte diventano studi del paziente; il collegamento viene salvato insieme al referto.
 * Con `startEmpty` (nuovo referto) l'elenco parte vuoto: le immagini già presenti nell'archivio del
 * paziente (anche collegate ad altri referti) si importano dal menu +.
 */
export function ReportImagesField({
  imaging,
  selected,
  onChange,
  disabled,
  studyDate,
  startEmpty,
}: {
  imaging: ReportImaging;
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  /** Data dell'esame scritta nel form: diventa la data delle immagini aggiunte. */
  studyDate?: string;
  /** L'elenco mostra solo le immagini collegate o aggiunte qui, non tutte quelle del paziente. */
  startEmpty?: boolean;
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

  // Studi mostrati nell'elenco: tutti, oppure (nuovo referto) solo quelli collegati, aggiunti o importati qui.
  const [shown, setShown] = useState<ReadonlySet<string>>(() => new Set(startEmpty ? imaging.linkedIds : imaging.studies.map((s) => s.id)));
  const visible = imaging.studies.filter((s) => shown.has(s.id));
  const others = imaging.studies.filter((s) => !shown.has(s.id));

  // Gli studi appena caricati dal CD (comparsi dopo l'apertura del form) vengono mostrati e selezionati da soli.
  const known = useRef(new Set(imaging.studies.map((s) => s.id)));
  useEffect(() => {
    const fresh = imaging.studies.filter((s) => !known.current.has(s.id)).map((s) => s.id);
    if (!fresh.length) return;
    for (const id of fresh) known.current.add(id);
    setShown((set) => new Set([...set, ...fresh]));
    onChange([...new Set([...selected, ...fresh])]);
    // Reagisce solo all'elenco che arriva dal server.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imaging.studies]);

  const toggle = (id: string, checked: boolean) => onChange(checked ? [...selected, id] : selected.filter((x) => x !== id));

  // Importazione dall'archivio del paziente (immagini di altri referti o non ancora assegnate).
  const [importOpen, setImportOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  function importPicked() {
    setShown((set) => new Set([...set, ...picked]));
    onChange([...new Set([...selected, ...picked])]);
    setImportOpen(false);
    setPicked([]);
  }

  // Rinomina, scollega ed elimina agiscono subito (non aspettano il salvataggio del referto).
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [acting, startAction] = useTransition();
  const busy = disabled || acting;

  function rename() {
    if (!editing) return;
    const { id, name } = editing;
    startAction(async () => {
      const result = await renameStudyAction(id, name);
      if (!result.ok) toast.error(result.message);
      else {
        setEditing(null);
        router.refresh();
      }
    });
  }

  /** Toglie il collegamento a qualsiasi referto (questo o un altro): le immagini tornano libere. */
  function unlink(id: string) {
    startAction(async () => {
      const result = await linkStudyReportAction(id, null);
      if (!result.ok) toast.error(result.message);
      else {
        onChange(selected.filter((x) => x !== id));
        toast.success('Collegamento rimosso: le immagini non sono più assegnate a un referto');
        router.refresh();
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Immagini</CardTitle>
        <CardDescription>
          {visible.length
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
              <DropdownMenuItem disabled={!others.length} onSelect={() => setImportOpen(true)}>
                <Database />
                <span className="grid">
                  Importa dall’archivio
                  <span className="text-xs text-muted-foreground">
                    {others.length ? 'Immagini di altri referti o già caricate' : 'Nessun’altra immagine del paziente'}
                  </span>
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardAction>
      </CardHeader>
      {visible.length > 0 && (
        <CardContent>
          <ul className="grid gap-2">
            {visible.map((s) => {
              const checked = selected.includes(s.id);
              const isEditing = editing?.id === s.id;
              return (
                <li
                  key={s.id}
                  className={cn(
                    'flex items-center gap-1 rounded-lg border pr-1 transition-colors hover:bg-muted/50',
                    checked && 'border-primary/50 bg-primary/5',
                  )}
                >
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 p-2">
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
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      {isEditing ? (
                        <Input
                          autoFocus
                          value={editing.name}
                          maxLength={300}
                          placeholder="Nome delle immagini"
                          aria-label="Nome delle immagini"
                          disabled={acting}
                          onChange={(e) => setEditing({ id: s.id, name: e.target.value })}
                          onKeyDown={(e) => {
                            // Invio salva il nome, non il referto.
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              rename();
                            }
                            if (e.key === 'Escape') {
                              e.preventDefault();
                              setEditing(null);
                            }
                          }}
                        />
                      ) : (
                        <span className="truncate text-sm font-medium">{s.title}</span>
                      )}
                      <span className="text-xs text-muted-foreground">{s.caption}</span>
                      {s.linkedElsewhere && (
                        <span className="text-xs text-muted-foreground">
                          {checked ? 'Era collegato a un altro referto: salvando passa a questo.' : 'Già collegato a un altro referto.'}
                        </span>
                      )}
                    </span>
                  </label>
                  <div className="flex shrink-0 items-center">
                    {isEditing ? (
                      <>
                        <Button type="button" variant="ghost" size="icon-sm" aria-label="Salva il nome" title="Salva" disabled={acting} onClick={rename}>
                          {acting ? <Spinner /> : <Check />}
                        </Button>
                        <Button type="button" variant="ghost" size="icon-sm" aria-label="Annulla" title="Annulla" disabled={acting} onClick={() => setEditing(null)}>
                          <X />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground"
                          aria-label="Rinomina"
                          title="Rinomina"
                          disabled={busy}
                          onClick={() => setEditing({ id: s.id, name: s.name ?? '' })}
                        >
                          <Pencil />
                        </Button>
                        {(s.linkedElsewhere || imaging.linkedIds.includes(s.id)) && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="text-muted-foreground"
                            aria-label="Rimuovi l’assegnazione a un referto"
                            title="Rimuovi l’assegnazione a un referto"
                            disabled={busy}
                            onClick={() => unlink(s.id)}
                          >
                            <Unlink />
                          </Button>
                        )}
                        <DeleteStudyButton studyId={s.id} imageCount={s.imageCount} onDeleted={() => onChange(selected.filter((x) => x !== s.id))} />
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      )}
      <Dialog
        open={importOpen}
        onOpenChange={(open) => {
          setImportOpen(open);
          if (!open) setPicked([]);
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Importa dall’archivio</DialogTitle>
            <DialogDescription>
              Scegli le immagini del paziente da collegare a questo referto. Quelle collegate a un altro referto passano a questo quando lo salvi.
            </DialogDescription>
          </DialogHeader>
          <ul className="-mx-1 grid max-h-[60vh] gap-2 overflow-y-auto px-1">
            {others.map((s) => {
              const checked = picked.includes(s.id);
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
                      onChange={(e) => setPicked(e.target.checked ? [...picked, s.id] : picked.filter((x) => x !== s.id))}
                    />
                    <span className="block size-12 shrink-0 overflow-hidden rounded-md bg-black">
                      {s.coverInstanceId && (
                        <img src={previewUrl(s.coverInstanceId, 'thumb')} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
                      )}
                    </span>
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="truncate text-sm font-medium">{s.title}</span>
                      <span className="text-xs text-muted-foreground">{s.caption}</span>
                      {s.linkedElsewhere && <span className="text-xs text-muted-foreground">Collegato a un altro referto.</span>}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Annulla
              </Button>
            </DialogClose>
            <Button type="button" disabled={!picked.length} onClick={importPicked}>
              {picked.length > 1 ? `Importa ${picked.length} studi` : 'Importa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
