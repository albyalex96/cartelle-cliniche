'use client';

import { AI_REPORT_PROMPT, parseAiReport, type ReportDraftDTO } from '@alby/shared';
import { Check, Copy, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

interface Props {
  disabled?: boolean;
  /** Dati letti dalla risposta, già nella forma del form, con le cose da ricontrollare. */
  onImport: (values: ReportDraftDTO['values'], warnings: string[]) => void;
}

/**
 * Compilazione da una foto con l'aiuto di un assistente IA esterno, scelto dall'utente:
 * qui si copia il prompt e si incolla la risposta. Tutto avviene nel browser: la webapp non invia nulla.
 */
export function AiImportDialog({ disabled, onImport }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(AI_REPORT_PROMPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Non riesco a copiare: seleziona il testo del prompt e copialo a mano');
    }
  }

  function confirm() {
    const result = parseAiReport(text);
    if (!result.ok) return setError(result.message);
    onImport(result.values, result.warnings);
    setOpen(false);
    setText('');
    setError(null);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={disabled}>
          <Sparkles />
          Compila da una foto
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Compila da una foto con un assistente IA</DialogTitle>
          <DialogDescription>
            La foto non passa da questa applicazione: la invii tu all’assistente che preferisci, e qui incolli la sua risposta.
          </DialogDescription>
        </DialogHeader>

        <ol className="grid gap-4 text-sm">
          <li className="grid gap-2">
            <span>
              <strong>1.</strong> Copia il prompt e incollalo nell’assistente, insieme alla foto del referto. Prima di inviarla ritaglia o copri
              l’intestazione con nome e dati del paziente: il prompt chiede di ignorarli, ma l’assistente vede comunque tutta la foto.
            </span>
            <div>
              <Button type="button" variant="secondary" size="sm" onClick={copyPrompt}>
                {copied ? <Check /> : <Copy />}
                {copied ? 'Copiato' : 'Copia il prompt'}
              </Button>
            </div>
            <details className="text-muted-foreground">
              <summary className="cursor-pointer select-none">Mostra il prompt</summary>
              <pre className="mt-2 max-h-48 overflow-auto rounded-lg border bg-muted/50 p-3 text-xs whitespace-pre-wrap">{AI_REPORT_PROMPT}</pre>
            </details>
          </li>
          <li className="grid gap-2">
            <label htmlFor="ai-answer">
              <strong>2.</strong> Incolla qui la risposta dell’assistente, per intero.
            </label>
            <Textarea
              id="ai-answer"
              rows={8}
              className="max-h-64 font-mono text-xs"
              placeholder={'{\n  "kind": "LABORATORIO",\n  …\n}'}
              value={text}
              aria-invalid={error ? true : undefined}
              onChange={(e) => {
                setText(e.target.value);
                setError(null);
              }}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </li>
        </ol>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Annulla
            </Button>
          </DialogClose>
          <Button type="button" onClick={confirm} disabled={!text.trim()}>
            Compila il form
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
