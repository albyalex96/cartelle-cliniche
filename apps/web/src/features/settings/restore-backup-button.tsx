'use client';

import type { BackupRestoreResultDTO } from '@alby/shared';
import { Upload } from 'lucide-react';
import { useRef, useState } from 'react';
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
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

type Reply = { ok: true; data: BackupRestoreResultDTO } | { ok: false; message: string };

/**
 * Ripristino di un backup completo: si sceglie il file .zip, si conferma, il file viene inviato a `/api/backup`
 * (con l'avanzamento del caricamento). Alla fine tutti sono disconnessi: si torna all'accesso.
 */
export function RestoreBackupButton() {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const busy = progress !== null;

  function restore(chosen: File) {
    setProgress(0);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/backup');
    xhr.setRequestHeader('Content-Type', 'application/zip');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onerror = () => {
      setProgress(null);
      toast.error('Connessione al server interrotta durante il ripristino');
    };
    xhr.onload = () => {
      let reply: Reply;
      try {
        reply = JSON.parse(xhr.responseText) as Reply;
      } catch {
        reply = { ok: false, message: 'Ripristino non riuscito' };
      }
      if (!reply.ok) {
        setProgress(null);
        toast.error(reply.message);
        return;
      }
      setFile(null);
      toast.success('Backup ripristinato: accedi di nuovo', {
        description: `Backup del ${new Date(reply.data.createdAt).toLocaleString('it-IT')} · ${reply.data.patients.toLocaleString('it-IT')} pazienti`,
      });
      setTimeout(() => window.location.assign('/login'), 1500);
    };
    xhr.send(chosen);
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        accept=".zip,application/zip"
        className="hidden"
        onChange={(e) => {
          setFile(e.target.files?.[0] ?? null);
          e.target.value = '';
        }}
      />
      <Button variant="outline" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? <Spinner /> : <Upload />}
        {!busy ? 'Ripristina un backup' : progress < 100 ? `Caricamento ${progress}%` : 'Ripristino in corso…'}
      </Button>

      <AlertDialog open={file !== null && !busy} onOpenChange={(open) => !open && setFile(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ripristinare questo backup?</AlertDialogTitle>
            <AlertDialogDescription>
              Tutti i dati attuali (pazienti, referti, terapie, immagini, utenti e impostazioni) saranno sostituiti da quelli di «{file?.name}». Le
              modifiche fatte dopo il backup andranno perse. Al termine tutti gli utenti, compreso te, dovranno accedere di nuovo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => file && restore(file)}>
              Sostituisci tutti i dati
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
