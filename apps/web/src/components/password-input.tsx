'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useState, type ComponentProps } from 'react';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';

export function PasswordInput(props: Omit<ComponentProps<typeof InputGroupInput>, 'type'>) {
  const [visible, setVisible] = useState(false);
  return (
    <InputGroup>
      <InputGroupInput type={visible ? 'text' : 'password'} {...props} />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          size="icon-xs"
          aria-label={visible ? 'Nascondi password' : 'Mostra password'}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? <EyeOff /> : <Eye />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}

/** Password casuale leggibile (senza caratteri ambigui come 0/O, 1/l). */
export function generatePassword(length = 14): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}
