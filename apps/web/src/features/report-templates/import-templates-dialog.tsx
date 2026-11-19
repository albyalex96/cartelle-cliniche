'use client';

import { Upload } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { importReportTemplatesAction } from '@/server/actions/report-templates';

const MAX_FILE_BYTES = 2 * 1024 * 1024;

/** Importa tipi di referto da un file .json esportato o dal codice copiato. */
export function ImportTemplatesDialog() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function readFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) return setError('File troppo grande');
    setText(await file.text());
    setError(null);
  }

  function confirm() {
    startTransition(async () => {
      const result = await importReportTemplatesAction(text);
      if (!result.ok) return setError(result.message);
      toast.success(result.data.length === 1 ? `Importato «${result.data[0]}»` : `Importati ${result.data.length} tipi di referto`);
      setOpen(false);
      setText('');
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload />
          Importa
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importa tipi di referto</DialogTitle>
          <DialogDescription>
            Scegli un file .json esportato oppure incolla il codice copiato. I tipi vengono aggiunti a quelli esistenti: se un nome è già usato, il
            nuovo riceve un numero (es. «Ecografia (2)»).
          </DialogDescription>
        </DialogHeader>
        <Input type="file" accept=".json,application/json" onChange={(e) => void readFile(e.target.files?.[0])} />
        <Textarea
          rows={10}
          className="max-h-72 font-mono text-xs"
          placeholder={'{\n  "format": "alby-tipi-referto",\n  …\n}'}
          value={text}
          aria-label="Codice JSON dei tipi di referto"
          aria-invalid={error ? true : undefined}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={pending}>
              Annulla
            </Button>
          </DialogClose>
          <Button type="button" onClick={confirm} disabled={!text.trim() || pending}>
            {pending && <Spinner />}
            Importa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
