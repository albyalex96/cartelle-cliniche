'use client';

import { hasLabTable, MAX_PDF_BYTES, type ReportDraftDTO, type ReportTemplateDTO } from '@alby/shared';
import { FileText, FileUp, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition, type ChangeEvent, type CSSProperties } from 'react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { discardDraftPdfAction, uploadReportForDraftAction } from '@/server/actions/reports';
import { DocumentPane } from './document-pane';
import { DraftNotices } from './draft-notices';
import { ReportForm } from './report-form';
import type { ReportImaging } from './report-imaging';
import { ScanBridgeProvider, useScanBridge } from './scan-bridge';

const emptyValues = (templateId: string): ReportDraftDTO['values'] => ({
  templateId,
  title: '',
  examDate: '',
  samplingDate: '',
  reportDate: '',
  reportNumber: '',
  facility: '',
  doctor: '',
  doctorRole: '',
  body: '',
  notes: '',
  custom: {},
  results: [],
});

/**
 * Modal "Inserisci referto": form con il tipo già scelto e, in alto, "Carica PDF" (CD/DVD e altre immagini
 * si aggiungono dalla sezione Immagini del form).
 * Un PDF con testo compila il form da solo; per una scansione compaiono i bottoni per leggere le zone (OCR).
 * Chiudendo senza salvare, il PDF caricato viene scartato (dopo conferma).
 */
export function NewReportDialog({
  template,
  templates,
  imaging,
  open,
  onOpenChange,
}: {
  /** Tipo scelto dal menu "+" (nel form si può ancora cambiare). */
  template: ReportTemplateDTO;
  templates: ReportTemplateDTO[];
  imaging: ReportImaging;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <ScanBridgeProvider>
      <DialogBody template={template} templates={templates} imaging={imaging} open={open} onOpenChange={onOpenChange} />
    </ScanBridgeProvider>
  );
}

function DialogBody({
  template,
  templates,
  imaging,
  open,
  onOpenChange,
}: {
  template: ReportTemplateDTO;
  templates: ReportTemplateDTO[];
  imaging: ReportImaging;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const bridge = useScanBridge();
  const patientId = imaging.patient.id;
  const [draft, setDraft] = useState<ReportDraftDTO | null>(null);
  const [dirty, setDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [uploading, startUpload] = useTransition();
  const [discarding, startDiscard] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const file = draft?.file ?? null;

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const chosen = e.target.files?.[0];
    e.target.value = ''; // permette di riscegliere lo stesso file
    if (!chosen) return;
    if (chosen.size > MAX_PDF_BYTES) {
      toast.error(`Il file supera i ${MAX_PDF_BYTES / 1024 / 1024} MB`);
      return;
    }
    const data = new FormData();
    data.set('file', chosen);
    startUpload(async () => {
      const result = await uploadReportForDraftAction(patientId, data);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      const { draft: next, existingReportUrl } = result.data;
      if (!next) {
        toast.info('Questo PDF era già stato importato: apro il referto esistente.');
        router.push(existingReportUrl);
        return;
      }
      setDraft(next);
      // PDF con testo: i dati letti vanno nel form già aperto (solo nei campi vuoti).
      if (next.parser) {
        bridge?.deliverDraft(next);
        toast.success('Dati letti dal PDF: controllali confrontandoli con il documento');
      }
    });
  }

  /** Toglie il PDF caricato (eliminandolo dal server); i dati già nel form restano. */
  function removePdf(then?: () => void) {
    if (!file) return then?.();
    startDiscard(async () => {
      const result = await discardDraftPdfAction(file.id);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      bridge?.cancelSelection();
      setDraft(null);
      then?.();
    });
  }

  const close = () => {
    setDraft(null);
    setDirty(false);
    onOpenChange(false);
  };
  /** Chiusura (X, Esc, clic fuori, Annulla): se c'è qualcosa da perdere si chiede conferma. */
  const requestClose = () => (file || dirty ? setConfirmClose(true) : close());

  // Il PDF sembra analisi (o testo libero) ma il tipo scelto no: lo si segnala (il tipo resta quello scelto).
  const pdfIsLab = draft?.parser ? draft.values.results.length > 0 : null;
  const kindHint =
    pdfIsLab !== null && pdfIsLab !== hasLabTable(template.fields)
      ? `Il PDF sembra ${pdfIsLab ? 'un esame di laboratorio' : 'un referto descrittivo'}: se è così, cambia il tipo nel form.`
      : null;

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : requestClose())}>
        <DialogContent
          className={cn(
            'flex h-[calc(100dvh-2rem)] max-w-[calc(100%-2rem)] flex-col gap-3 overflow-hidden p-0 sm:max-w-[calc(100%-2rem)]',
            !file && 'lg:max-w-3xl',
          )}
          // Durante la selezione di una zona, Esc annulla la selezione e il modal resta aperto.
          onEscapeKeyDown={(e) => {
            if (bridge?.selection) e.preventDefault();
          }}
          onInteractOutside={(e) => {
            if (bridge?.selection) e.preventDefault();
          }}
        >
          <DialogHeader className="gap-1 border-b px-4 pt-4 pb-3 pr-12">
            <DialogTitle>Nuovo referto · {template.name}</DialogTitle>
            <DialogDescription>
              {imaging.patient.firstName} {imaging.patient.lastName}: compila a mano oppure carica il PDF del referto. Le immagini (CD/DVD, foto, ritagli del PDF) si aggiungono nella sezione Immagini.
            </DialogDescription>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input ref={input} type="file" accept="application/pdf,.pdf" className="sr-only" tabIndex={-1} onChange={onFile} />
              {file ? (
                <span className="flex max-w-full items-center gap-1.5 rounded-lg border bg-muted/50 py-1 pr-1 pl-2.5 text-sm">
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate" title={file.fileName}>
                    {file.fileName}
                  </span>
                  <Button type="button" variant="ghost" size="icon-xs" aria-label="Rimuovi il PDF" disabled={discarding} onClick={() => removePdf()}>
                    {discarding ? <Spinner /> : <X />}
                  </Button>
                </span>
              ) : (
                <Button type="button" disabled={uploading} onClick={() => input.current?.click()}>
                  {uploading ? <Spinner /> : <FileUp />}
                  {uploading ? 'Lettura del PDF…' : 'Carica PDF'}
                </Button>
              )}
            </div>
          </DialogHeader>

          <div className={cn('grid min-h-0 flex-1 gap-4 overflow-y-auto px-4 pb-4 lg:overflow-hidden', file && 'lg:grid-cols-2')} style={{ '--viewer-offset': '13rem' } as CSSProperties}>
            <div className="grid min-w-0 content-start gap-4 lg:overflow-y-auto lg:pr-1">
              {draft && <DraftNotices draft={draft} />}
              {kindHint && (
                <Alert>
                  <AlertDescription>{kindHint}</AlertDescription>
                </Alert>
              )}
              <ReportForm
                mode={{ type: 'create', patientId, fileId: file?.id ?? null, parser: draft?.parser ?? null, cancelHref: '', onCancel: requestClose }}
                initial={emptyValues(template.id)}
                imaging={imaging}
                templates={templates}
                onDirtyChange={setDirty}
              />
            </div>
            {/* Sul telefono il documento sta in alto; da computer a destra del form. */}
            {file && draft && <DocumentPane file={file} doc={draft}className="order-first lg:order-last lg:static" />}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Chiudere senza salvare?</AlertDialogTitle>
            <AlertDialogDescription>
              {file ? 'Il PDF caricato e i dati inseriti andranno persi.' : 'I dati inseriti andranno persi.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continua a compilare</AlertDialogCancel>
            <AlertDialogAction
              disabled={discarding}
              onClick={(e) => {
                e.preventDefault();
                removePdf(() => {
                  setConfirmClose(false);
                  close();
                });
              }}
            >
              {discarding && <Spinner />}
              Chiudi e scarta
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
