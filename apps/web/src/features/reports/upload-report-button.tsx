'use client';

import { MAX_PDF_BYTES } from '@alby/shared';
import { FileUp } from 'lucide-react';
import { useRef, useTransition, type ChangeEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { uploadReportPdfAction } from '@/server/actions/reports';

/**
 * "Carica PDF": sceglie il file e lo invia al server, che lo legge e apre la schermata di revisione.
 * Il PDF non viene mai letto nel browser: l'estrazione avviene solo sul server.
 */
export function UploadReportButton({ patientId, variant = 'default' }: { patientId: string; variant?: 'default' | 'outline' }) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // permette di riscegliere lo stesso file
    if (!file) return;
    if (file.size > MAX_PDF_BYTES) {
      toast.error(`Il file supera i ${MAX_PDF_BYTES / 1024 / 1024} MB`);
      return;
    }
    const data = new FormData();
    data.set('file', file);
    startTransition(async () => {
      // In caso di successo il server porta alla revisione (o al referto già importato).
      const result = await uploadReportPdfAction(patientId, data);
      if (!result.ok) toast.error(result.message);
    });
  }

  return (
    <>
      <input ref={input} type="file" accept="application/pdf,.pdf" className="sr-only" tabIndex={-1} onChange={onChange} />
      <Button variant={variant} disabled={pending} onClick={() => input.current?.click()}>
        {pending ? <Spinner /> : <FileUp />}
        {pending ? 'Lettura del PDF…' : 'Carica PDF'}
      </Button>
    </>
  );
}
