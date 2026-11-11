'use client';

import { useCallback, useState, type ChangeEvent } from 'react';
import type { z } from 'zod';

type Errors = Record<string, string>;

/** Forma minima del risultato di una Server Action (vedi `server/action-result.ts`). */
interface ResultLike {
  ok: boolean;
  fields?: Record<string, string>;
}

function issuesToErrors(issues: z.core.$ZodIssue[]): Errors {
  const errors: Errors = {};
  for (const issue of issues) errors[issue.path.join('.') || '_'] ??= issue.message;
  return errors;
}

/**
 * Gestione leggera dei form lato client: valori, errori per campo e validazione immediata
 * con gli stessi schemi Zod che il server riapplica (pacchetto @alby/shared).
 */
export function useZodForm<In extends Record<string, unknown>, Out>(schema: z.ZodType<Out, In>, initial: In) {
  const [values, setValues] = useState<In>(initial);
  const [errors, setErrors] = useState<Errors>({});

  const setValue = useCallback(<K extends keyof In>(key: K, value: In[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => {
      if (!e[key as string]) return e;
      const next = { ...e };
      delete next[key as string];
      return next;
    });
  }, []);

  /** Valida i valori correnti; restituisce i dati puliti oppure `null` (e mostra gli errori). */
  const validate = useCallback((): Out | null => {
    const result = schema.safeParse(values);
    if (result.success) {
      setErrors({});
      return result.data;
    }
    setErrors(issuesToErrors(result.error.issues));
    return null;
  }, [schema, values]);

  /** Mostra sui campi gli errori di validazione restituiti dal server. Ritorna true se ce n'erano. */
  const applyResult = useCallback((result: ResultLike) => {
    if (!result.ok && result.fields) {
      setErrors(result.fields);
      return true;
    }
    return false;
  }, []);

  const reset = useCallback((next: In) => {
    setValues(next);
    setErrors({});
  }, []);

  /** Props pronte per un <Input>/<Textarea> testuale. */
  const text = <K extends keyof In>(key: K) => ({
    id: String(key),
    name: String(key),
    value: (values[key] as string | null | undefined) ?? '',
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setValue(key, e.target.value as In[K]),
    'aria-invalid': errors[key as string] ? true : undefined,
  });

  return { values, errors, setValue, setErrors, validate, applyResult, reset, text };
}
