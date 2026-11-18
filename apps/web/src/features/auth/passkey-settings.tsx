'use client';

import type { PasskeyDTO } from '@alby/shared';
import { startRegistration } from '@simplewebauthn/browser';
import { Plus, Trash2 } from 'lucide-react';
import { useState, useTransition, type FormEvent } from 'react';
import { toast } from 'sonner';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { FieldGroup } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { beginPasskeyRegistrationAction, deletePasskeyAction, finishPasskeyRegistrationAction } from '@/server/actions/security';

const formatDate = (iso: string) => new Date(iso).toLocaleDateString('it-IT');

export function PasskeySettings({ passkeys }: { passkeys: PasskeyDTO[] }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function add(e: FormEvent) {
    e.preventDefault();
    setError(undefined);
    if (!name.trim()) return setError('Dai un nome alla passkey');
    startTransition(async () => {
      const begun = await beginPasskeyRegistrationAction();
      if (!begun.ok) return setError(begun.message);
      let response;
      try {
        response = await startRegistration({ optionsJSON: begun.data.options });
      } catch {
        return setError('Registrazione annullata o non supportata da questo dispositivo');
      }
      const result = await finishPasskeyRegistrationAction({ challenge: begun.data.challenge, name, response });
      if (!result.ok) return setError(result.fields?.name ?? result.message);
      setName('');
      toast.success('Passkey aggiunta');
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const result = await deletePasskeyAction(id);
      if (result.ok) toast.success('Passkey rimossa');
      else toast.error(result.message);
    });
  }

  return (
    <div className="space-y-4">
      {passkeys.length > 0 && (
        <ul className="divide-y rounded-md border">
          {passkeys.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 p-3 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">{p.name}</p>
                <p className="text-muted-foreground">
                  Aggiunta il {formatDate(p.createdAt)}
                  {p.lastUsedAt && ` · ultimo uso il ${formatDate(p.lastUsedAt)}`}
                </p>
              </div>
              <Button variant="ghost" size="icon-sm" aria-label={`Rimuovi ${p.name}`} disabled={pending} onClick={() => remove(p.id)}>
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} noValidate>
        <FieldGroup>
          <FormField label="Nome della nuova passkey" htmlFor="passkeyName" error={error}>
            <Input id="passkeyName" placeholder="Es. iPhone" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
          <Button type="submit" variant="outline" disabled={pending} className="sm:w-fit">
            {pending ? <Spinner /> : <Plus />}
            Aggiungi passkey
          </Button>
        </FieldGroup>
      </form>
    </div>
  );
}
