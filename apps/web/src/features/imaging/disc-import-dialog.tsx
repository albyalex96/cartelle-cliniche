'use client';

import { readEncapsulatedPdf, type DiscFile, type DiscScan, type DiscStudy } from '@alby/dicom';
import { MAX_PDF_BYTES } from '@alby/shared';
import { CircleCheck, Disc3, FileText, FolderOpen, Images, RotateCcw, Save, TriangleAlert } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { uploadReportPdfAction } from '@/server/actions/reports';
import { MODALITY_LABELS } from './modalities';
import { useDicomUpload, type UploadState } from './use-dicom-upload';
import { useDiscReader } from './use-disc-reader';

/** Solo i dati anagrafici che servono a confrontare il disco con il paziente. */
export interface DiscPatient {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  fiscalCode: string | null;
}

const words = (s: string) =>
  new Set(
    s
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .split(/[^\p{L}]+/u)
      .filter((w) => w.length > 1),
  );

/** Il disco è del paziente giusto? Codice fiscale, poi nome e data di nascita. */
function identity(p: DiscPatient, d: DiscStudy['patient']): 'ok' | 'mismatch' | 'unknown' {
  const id = d.id?.replace(/\s/g, '').toUpperCase();
  if (id && p.fiscalCode && /^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/.test(id)) return id === p.fiscalCode ? 'ok' : 'mismatch';
  let checks = 0;
  if (d.name) {
    const onDisc = words(d.name);
    if (![...words(`${p.firstName} ${p.lastName}`)].every((w) => onDisc.has(w))) return 'mismatch';
    checks++;
  }
  if (d.birthDate && p.birthDate) {
    if (d.birthDate !== p.birthDate) return 'mismatch';
    checks++;
  }
  return checks ? 'ok' : 'unknown';
}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toLocaleString('it-IT', { maximumFractionDigits: bytes < 10 * 1024 * 1024 ? 1 : 0 })} MB`;

function StudyCard({
  study,
  patient,
  selected,
  onToggle,
  disabled,
}: {
  study: DiscStudy;
  patient: DiscPatient;
  selected: boolean;
  onToggle?: (selected: boolean) => void;
  disabled: boolean;
}) {
  const match = identity(patient, study.patient);
  const shown = study.series.slice(0, 6);
  return (
    <li className={cn('grid gap-2 rounded-lg border p-3 transition-colors', selected && 'border-primary/50 bg-primary/5')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <label className={cn('flex min-w-0 items-start gap-3', onToggle && 'cursor-pointer')}>
          {onToggle && (
            <input
              type="checkbox"
              className="mt-1 size-4 accent-primary"
              checked={selected}
              disabled={disabled}
              onChange={(e) => onToggle(e.target.checked)}
            />
          )}
          <span className="min-w-0">
            <span className="block font-medium">{study.description || 'Studio senza descrizione'}</span>
            <span className="block text-sm text-muted-foreground">
              {study.date ? formatDate(study.date) : 'Data non indicata'}
              {study.institution && ` · ${study.institution}`}
            </span>
          </span>
        </label>
        <div className="flex flex-wrap gap-1">
          {study.modalities.map((m) => (
            <Badge key={m} variant="secondary" title={m}>
              {MODALITY_LABELS[m] ?? m}
            </Badge>
          ))}
        </div>
      </div>
      <p className="text-sm">
        {study.series.length === 1 ? '1 serie' : `${study.series.length} serie`} · {study.imageCount} immagini · {mb(study.bytes)}
      </p>
      <ul className="grid gap-0.5 text-xs text-muted-foreground">
        {shown.map((s) => (
          <li key={s.uid} className="truncate">
            {s.number !== undefined && `${s.number}. `}
            {s.description || MODALITY_LABELS[s.modality ?? ''] || 'Serie'} — {s.files.length} immagini
          </li>
        ))}
        {study.series.length > shown.length && <li>… e altre {study.series.length - shown.length} serie</li>}
      </ul>
      {match === 'mismatch' ? (
        <p className="flex items-center gap-1.5 text-sm text-destructive">
          <TriangleAlert className="size-4 shrink-0" />
          Il disco è intestato a {study.patient.name ?? 'un’altra persona'}: controlla di aver scelto il paziente giusto.
        </p>
      ) : match === 'ok' ? (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <CircleCheck className="size-4 text-primary" />
          Intestato a {patient.firstName} {patient.lastName}
        </p>
      ) : null}
    </li>
  );
}

/** Un PDF trovato sul disco (file .pdf, o referto incapsulato in un file DICOM). */
interface FoundPdf {
  key: string;
  label: string;
  size: number;
  /** Il PDF pronto da caricare. */
  load: () => Promise<File | null>;
}

function foundPdfs(scan: DiscScan): FoundPdf[] {
  const fromFiles = scan.pdfs.map((f) => ({
    key: f.path,
    label: f.path,
    size: f.size,
    load: async () => (f as DiscFile & { file?: File }).file ?? null,
  }));
  const embedded = scan.encapsulatedPdfs.map(({ file, instance }, i) => {
    const name = `${instance.studyDescription || 'Referto'}${instance.studyDate ? ` ${instance.studyDate}` : ''}.pdf`;
    return {
      key: `dicom:${file.path}`,
      label: `${name} (dentro le immagini)`,
      size: file.size,
      load: async () => {
        const pdf = readEncapsulatedPdf(await file.read(0, file.size));
        return pdf ? new File([pdf.slice()], name.replace(/[\\/:*?"<>|]/g, '-') || `referto-${i + 1}.pdf`, { type: 'application/pdf' }) : null;
      },
    };
  });
  return [...fromFiles, ...embedded];
}

/**
 * "Leggi CD/DVD": chiede il permesso di leggere il lettore, mostra cosa c'è sul disco
 * (studi, serie, immagini, referti PDF), salva le immagini scelte e importa i referti.
 */
export function DiscImportDialog({ patient, canEdit, variant = 'outline' }: { patient: DiscPatient; canEdit: boolean; variant?: 'default' | 'outline' }) {
  const reader = useDiscReader();
  const uploader = useDicomUpload(patient.id);
  const [open, setOpen] = useState(false);
  const [importing, startImport] = useTransition();
  const [importingKey, setImportingKey] = useState<string | null>(null);
  const { state, pick, cancel, canPickFolder, inputProps } = reader;
  const uploading = uploader.state.status === 'uploading';

  function onOpenChange(next: boolean) {
    // Durante il salvataggio la finestra resta aperta (si può annullare con il pulsante).
    if (!next && uploading) return;
    setOpen(next);
    if (!next) {
      reader.reset();
      uploader.reset();
    }
  }

  function importPdf(pdf: FoundPdf) {
    setImportingKey(pdf.key);
    startImport(async () => {
      const file = await pdf.load();
      if (!file) {
        toast.error('Non sono riuscito a estrarre il PDF');
        return;
      }
      if (file.size > MAX_PDF_BYTES) {
        toast.error(`Il PDF supera i ${MAX_PDF_BYTES / 1024 / 1024} MB`);
        return;
      }
      const data = new FormData();
      data.set('file', file);
      // In caso di successo il server porta alla revisione del referto.
      const result = await uploadReportPdfAction(patient.id, data);
      if (!result.ok) toast.error(result.message);
    });
  }

  const busy = state.status === 'listing' || state.status === 'scanning';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant={variant}>
          <Disc3 />
          Leggi CD/DVD
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl" showCloseButton={!uploading}>
        <DialogHeader>
          <DialogTitle>Leggi un CD/DVD</DialogTitle>
          <DialogDescription>
            Esami di {patient.firstName} {patient.lastName}. Il disco viene letto solo su questo computer: al server arrivano soltanto le immagini che
            scegli di salvare.
          </DialogDescription>
        </DialogHeader>
        <input {...inputProps} />

        {state.status === 'idle' && (
          <div className="grid gap-4">
            <ol className="grid list-decimal gap-1.5 pl-5 text-sm">
              <li>Inserisci il disco nel lettore e chiudi l’eventuale finestra che si apre da sola.</li>
              <li>
                Premi <strong>Scegli il disco</strong> e seleziona l’unità del lettore (ad esempio <em>Unità DVD (D:)</em>), oppure una cartella in cui hai
                copiato il CD.
              </li>
              <li>
                {canPickFolder
                  ? 'Il browser ti chiederà il permesso di leggere i file: consenti la sola lettura.'
                  : 'Il browser ti chiederà di confermare il caricamento dei file della cartella: resteranno comunque su questo computer.'}
              </li>
            </ol>
            <Button className="w-fit" onClick={pick}>
              <FolderOpen />
              Scegli il disco
            </Button>
          </div>
        )}

        {busy && (
          <div className="grid gap-3">
            <p className="flex items-center gap-2 text-sm">
              <Spinner />
              {state.status === 'listing'
                ? `Elenco dei file sul disco… ${state.found ? `(${state.found})` : ''}`
                : `Lettura delle immagini: ${state.done} di ${state.total} file`}
            </p>
            {state.status === 'scanning' && <ProgressBar value={state.done} max={state.total} />}
            <p className="text-xs text-muted-foreground">Da un lettore ottico può volerci qualche minuto.</p>
            <Button variant="outline" className="w-fit" onClick={cancel}>
              Annulla
            </Button>
          </div>
        )}

        {state.status === 'error' && (
          <div className="grid gap-3">
            <Alert variant="destructive">
              <TriangleAlert />
              <AlertTitle>Lettura non riuscita</AlertTitle>
              <AlertDescription>{state.message}</AlertDescription>
            </Alert>
            <Button variant="outline" className="w-fit" onClick={pick}>
              <RotateCcw />
              Riprova
            </Button>
          </div>
        )}

        {state.status === 'done' && (
          <DiscResult
            scan={state.scan}
            fileCount={state.fileCount}
            folder={state.folder}
            patient={patient}
            canEdit={canEdit}
            onImportPdf={importPdf}
            importingPdf={importing ? importingKey : null}
            upload={uploader}
            onAgain={() => {
              reader.reset();
              uploader.reset();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
      <div className="h-full bg-primary transition-[width]" style={{ width: `${max ? (value / max) * 100 : 0}%` }} />
    </div>
  );
}

function DiscResult({
  scan,
  fileCount,
  folder,
  patient,
  canEdit,
  onImportPdf,
  importingPdf,
  upload,
  onAgain,
}: {
  scan: DiscScan;
  fileCount: number;
  folder: string;
  patient: DiscPatient;
  canEdit: boolean;
  onImportPdf: (pdf: FoundPdf) => void;
  importingPdf: string | null;
  upload: ReturnType<typeof useDicomUpload>;
  onAgain: () => void;
}) {
  const pdfs = foundPdfs(scan);
  // Di default si salvano tutti gli studi, tranne quelli intestati a un'altra persona.
  const [selected, setSelected] = useState(() => new Set(scan.studies.filter((s) => identity(patient, s.patient) !== 'mismatch').map((s) => s.uid)));
  const chosen = scan.studies.filter((s) => selected.has(s.uid));
  const chosenImages = chosen.reduce((n, s) => n + s.imageCount, 0);
  const chosenBytes = chosen.reduce((n, s) => n + s.bytes, 0);
  const { state } = upload;
  const locked = state.status === 'uploading';

  const start = () => void upload.upload(chosen.flatMap((s) => s.series.flatMap((x) => x.files)));

  return (
    <div className="grid gap-5">
      <p className="text-sm text-muted-foreground">
        {folder && <>Disco «{folder}»: </>}
        {fileCount} file
        {scan.source === 'dicomdir' && ' · indice DICOMDIR trovato'}
      </p>

      <section className="grid gap-2">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <Images className="size-4" />
          Immagini
        </h3>
        {scan.studies.length ? (
          <>
            <ul className="grid gap-2">
              {scan.studies.map((s) => (
                <StudyCard
                  key={s.uid}
                  study={s}
                  patient={patient}
                  selected={selected.has(s.uid)}
                  disabled={locked || state.status === 'done'}
                  onToggle={
                    canEdit
                      ? (on) =>
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (on) next.add(s.uid);
                            else next.delete(s.uid);
                            return next;
                          })
                      : undefined
                  }
                />
              ))}
            </ul>
            {canEdit && <UploadPanel state={state} images={chosenImages} bytes={chosenBytes} onStart={start} onCancel={upload.cancel} />}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nessuna immagine DICOM trovata. Se il disco contiene solo un programma di visualizzazione, prova a cercare una cartella chiamata
            “DICOM” o “IMAGES”.
          </p>
        )}
      </section>

      {pdfs.length > 0 && (
        <section className="grid gap-2">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <FileText className="size-4" />
            Referti PDF sul disco
          </h3>
          <ul className="grid gap-2">
            {pdfs.map((pdf) => (
              <li key={pdf.key} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <span className="min-w-0">
                  <span className="block truncate text-sm">{pdf.label}</span>
                  <span className="text-xs text-muted-foreground">{mb(pdf.size)}</span>
                </span>
                {canEdit && (
                  <Button size="sm" variant="outline" disabled={importingPdf !== null || locked} onClick={() => onImportPdf(pdf)}>
                    {importingPdf === pdf.key && <Spinner />}
                    Importa come referto
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {!locked && (
        <Button variant="ghost" className="w-fit" onClick={onAgain}>
          <Disc3 />
          Leggi un altro disco
        </Button>
      )}
    </div>
  );
}

function UploadPanel({ state, images, bytes, onStart, onCancel }: { state: UploadState; images: number; bytes: number; onStart: () => void; onCancel: () => void }) {
  if (state.status === 'uploading') {
    return (
      <div className="grid gap-2 rounded-lg bg-muted/50 p-3">
        <p className="flex items-center gap-2 text-sm">
          <Spinner />
          Salvataggio: {state.sentFiles} di {state.totalFiles} immagini ({mb(state.sentBytes)} di {mb(state.totalBytes)})
        </p>
        <ProgressBar value={state.sentBytes} max={state.totalBytes} />
        <p className="text-xs text-muted-foreground">Non togliere il disco e non chiudere la pagina finché non ha finito.</p>
        <Button variant="outline" size="sm" className="w-fit" onClick={onCancel}>
          Interrompi
        </Button>
      </div>
    );
  }
  if (state.status === 'done' || state.status === 'error') {
    const { result } = state;
    return (
      <div className="grid gap-3">
        {state.status === 'error' ? (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertTitle>Salvataggio interrotto</AlertTitle>
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        ) : (
          <Alert>
            <CircleCheck />
            <AlertTitle>{state.cancelled ? 'Salvataggio interrotto' : 'Immagini salvate'}</AlertTitle>
            <AlertDescription>
              {result.added === 1 ? '1 immagine salvata' : `${result.added} immagini salvate`}
              {result.duplicates > 0 && `, ${result.duplicates} erano già presenti`}
              {state.cancelled && '. Puoi ripetere il salvataggio: le immagini già salvate non vengono duplicate'}. Le trovi nella sezione Immagini del paziente.
            </AlertDescription>
          </Alert>
        )}
        {result.rejected.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">{result.rejected.length} file non salvati</summary>
            <ul className="mt-1 grid gap-0.5 text-xs text-muted-foreground">
              {result.rejected.slice(0, 20).map((r, i) => (
                <li key={i}>
                  {r.name}: {r.reason}
                </li>
              ))}
              {result.rejected.length > 20 && <li>… e altri {result.rejected.length - 20}</li>}
            </ul>
          </details>
        )}
        {(state.status === 'error' || state.cancelled) && (
          <Button variant="outline" size="sm" className="w-fit" onClick={onStart}>
            <RotateCcw />
            Riprova
          </Button>
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg bg-muted/50 p-3">
      <Button disabled={images === 0} onClick={onStart}>
        <Save />
        Salva {images === 1 ? '1 immagine' : `${images} immagini`}
      </Button>
      <span className="text-sm text-muted-foreground">{images ? mb(bytes) : 'Scegli almeno uno studio'}</span>
    </div>
  );
}
