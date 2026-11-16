import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from '@/lib/session';
import { Button, ErrorBox, Paragraph, Screen, Title } from '@/ui/controls';

export default function UnlockScreen() {
  const { unlock, signOut, user } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const asked = useRef(false);

  const tryUnlock = useCallback(async () => {
    setBusy(true);
    setError(null);
    const result = await unlock();
    setBusy(false);
    if (!result.ok) setError(result.message);
  }, [unlock]);

  // Chiede subito l'impronta all'apertura, una volta sola: poi si riprova col pulsante.
  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    void tryUnlock();
  }, [tryUnlock]);

  return (
    <Screen>
      <Title>App bloccata</Title>
      <Paragraph muted>{user ? `Accesso come ${user.displayName}.` : ''} Sblocca con l’impronta, il volto o il PIN del telefono.</Paragraph>
      <ErrorBox message={error} />
      <Button title="Sblocca" onPress={tryUnlock} busy={busy} />
      <Button title="Esci dall’account" variant="secondary" onPress={signOut} disabled={busy} />
    </Screen>
  );
}
