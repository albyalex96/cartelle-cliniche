'use client';

import type { TotpSetupDTO } from '@alby/shared';
import { Copy } from 'lucide-react';
import { useState, useTransition, type FormEvent } from 'react';
import { toast } from 'sonner';
import { FormField } from '@/components/form-field';
import { PasswordInput } from '@/components/password-input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FieldGroup } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { beginTotpSetupAction, confirmTotpSetupAction, disableTotpAction } from '@/server/actions/security';

async function copy(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(done);
  } catch {
    // Gli appunti funzionano solo su HTTPS o localhost.
    toast.error('Copia non disponibile: seleziona il testo a mano');
  }
}

type Step = 'idle' | 'password' | 'scan';

export function TwoFactorSettings({ enabled, recoveryCodesLeft }: { enabled: boolean; recoveryCodesLeft: number }) {
  const [step, setStep] = useState<Step>('idle');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [setup, setSetup] = useState<TotpSetupDTO>();
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>();
  const [pending, startTransition] = useTransition();

  function reset() {
    setStep('idle');
    setPassword('');
    setCode('');
    setError(undefined);
    setSetup(undefined);
  }

  function submitPassword(e: FormEvent) {
    e.preventDefault();
    setError(undefined);
    startTransition(async () => {
      if (enabled) {
        const result = await disableTotpAction({ password });
        if (!result.ok) return setError(result.fields?.password ?? result.message);
        toast.success('Verifica in due passaggi disattivata');
        return reset();
      }
      const result = await beginTotpSetupAction({ password });
      if (!result.ok) return setError(result.fields?.password ?? result.message);
      setSetup(result.data);
      setPassword('');
      setStep('scan');
    });
  }

  function submitCode(e: FormEvent) {
    e.preventDefault();
    setError(undefined);
    startTransition(async () => {
      const result = await confirmTotpSetupAction({ code });
      if (!result.ok) return setError(result.fields?.code ?? result.message);
      setRecoveryCodes(result.data.recoveryCodes);
      reset();
    });
  }

  if (recoveryCodes) {
    const text = recoveryCodes.join('\n');
    return (
      <div className="space-y-4">
        <p className="text-sm">
          Verifica attiva. Conserva questi codici in un posto sicuro: ognuno vale una volta sola e permette di accedere senza
          telefono. Non verranno più mostrati.
        </p>
        <ul className="grid gap-1 rounded-md border p-3 font-mono text-sm sm:grid-cols-2">
          {recoveryCodes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => copy(text, 'Codici copiati')}>
            <Copy />
            Copia i codici
          </Button>
          <Button onClick={() => setRecoveryCodes(undefined)}>Li ho salvati</Button>
        </div>
      </div>
    );
  }

  if (step === 'scan' && setup) {
    return (
      <form onSubmit={submitCode} noValidate className="space-y-4">
        <p className="text-sm">Inquadra il QR con la tua app di autenticazione, oppure copia la chiave.</p>
        {/* Sfondo bianco fisso: sul tema scuro il QR deve restare leggibile. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`data:image/svg+xml;utf8,${encodeURIComponent(setup.qrSvg)}`}
          alt="QR code per l'app di autenticazione"
          className="size-48 rounded-md bg-white p-1"
        />
        <FieldGroup>
          <FormField label="Chiave" htmlFor="totpSecret">
            <div className="flex gap-2">
              <Input id="totpSecret" readOnly value={setup.secret} className="font-mono" onFocus={(e) => e.target.select()} />
              <Button type="button" variant="outline" size="icon" aria-label="Copia la chiave" onClick={() => copy(setup.secret, 'Chiave copiata')}>
                <Copy />
              </Button>
            </div>
          </FormField>
          <FormField label="Codice a 6 cifre" htmlFor="totpCode" error={error}>
            <Input
              id="totpCode"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </FormField>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending}>
              {pending && <Spinner />}
              Attiva
            </Button>
            <Button type="button" variant="ghost" onClick={reset}>
              Annulla
            </Button>
          </div>
        </FieldGroup>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant={enabled ? 'default' : 'outline'}>{enabled ? 'Attiva' : 'Non attiva'}</Badge>
        {enabled && <span className="text-muted-foreground">Codici di recupero rimasti: {recoveryCodesLeft}</span>}
      </div>
      {step === 'password' ? (
        <form onSubmit={submitPassword} noValidate>
          <FieldGroup>
            <FormField label="Conferma la password" htmlFor="totpPassword" error={error}>
              <PasswordInput
                id="totpPassword"
                autoFocus
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </FormField>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant={enabled ? 'destructive' : 'default'} disabled={pending}>
                {pending && <Spinner />}
                {enabled ? 'Disattiva' : 'Continua'}
              </Button>
              <Button type="button" variant="ghost" onClick={reset}>
                Annulla
              </Button>
            </div>
          </FieldGroup>
        </form>
      ) : (
        <Button variant={enabled ? 'outline' : 'default'} onClick={() => setStep('password')}>
          {enabled ? 'Disattiva' : 'Configura'}
        </Button>
      )}
    </div>
  );
}
