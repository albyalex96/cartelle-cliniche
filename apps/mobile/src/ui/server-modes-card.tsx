import { MAINTENANCE_NOTE_MAX, type ServerModesDTO } from '@alby/shared';
import { Lock, LockOpen, Wrench } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { onlineErrorMessage, useApi, useOnline } from '@/lib/online';
import { Card, Detail } from './blocks';
import { Button, ErrorBox, Field } from './controls';
import { spacing } from './theme';

const dateTime = new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: 'short' });
const since = (mode: { since: string; byName: string | null }) =>
  `dal ${dateTime.format(new Date(mode.since))}${mode.byName ? ` (${mode.byName})` : ''}`;

/**
 * Solo per gli amministratori, solo online: blocco accessi (chi non è amministratore resta sospeso) e
 * modalità manutenzione (chi non è amministratore può solo consultare), come nelle impostazioni della webapp.
 */
export function ServerModesCard() {
  const { send } = useApi();
  const { state, reload } = useOnline<ServerModesDTO>('/admin/server-modes');
  const [modes, setModes] = useState<ServerModesDTO | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState<'lockdown' | 'maintenance' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (state.status !== 'ready') return;
    setModes(state.data);
    setMessage(state.data.maintenance?.message ?? '');
  }, [state]);

  async function change(kind: 'lockdown' | 'maintenance', body: object) {
    setBusy(kind);
    setError(null);
    try {
      const next = await send<ServerModesDTO>('POST', '/admin/server-modes', { body });
      setModes(next);
      setMessage(next.maintenance?.message ?? '');
    } catch (err) {
      setError(onlineErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  const confirm = (title: string, text: string, action: string, run: () => void) =>
    Alert.alert(title, text, [
      { text: 'Annulla', style: 'cancel' },
      { text: action, style: 'destructive', onPress: run },
    ]);

  if (!modes) {
    return (
      <Card title="Server" subtitle="Blocco accessi e manutenzione (serve la connessione).">
        <ErrorBox message={state.status === 'error' ? state.message : null} />
        {state.status === 'error' ? <Button title="Riprova" variant="secondary" onPress={reload} /> : null}
      </Card>
    );
  }

  const { lockdown, maintenance } = modes;
  return (
    <Card title="Server" subtitle="Valgono per tutti gli utenti che non sono amministratori, su webapp e app.">
      <Detail label="Blocco accessi" value={lockdown ? `Attivo ${since(lockdown)}` : 'Non attivo'} />
      <Button
        title={lockdown ? 'Sblocca gli accessi' : 'Blocca gli accessi'}
        icon={lockdown ? LockOpen : Lock}
        variant="secondary"
        busy={busy === 'lockdown'}
        disabled={busy !== null}
        onPress={() =>
          lockdown
            ? void change('lockdown', { lockdown: false })
            : confirm(
                'Bloccare gli accessi?',
                'Chi non è amministratore resta sospeso finché non sblocchi: non perde il login, ma non vede più nulla.',
                'Blocca',
                () => void change('lockdown', { lockdown: true }),
              )
        }
      />

      <View style={styles.section}>
        <Detail label="Manutenzione" value={maintenance ? `Attiva ${since(maintenance)}` : 'Non attiva'} />
        <Field
          label="Avviso (facoltativo)"
          value={message}
          onChangeText={setMessage}
          maxLength={MAINTENANCE_NOTE_MAX}
          placeholder="es. fino alle 18:00"
        />
        {maintenance && message.trim() !== (maintenance.message ?? '') ? (
          <Button
            title="Aggiorna l’avviso"
            variant="secondary"
            busy={busy === 'maintenance'}
            disabled={busy !== null}
            onPress={() => void change('maintenance', { maintenance: { active: true, message } })}
          />
        ) : null}
        <Button
          title={maintenance ? 'Termina la manutenzione' : 'Avvia la manutenzione'}
          icon={Wrench}
          variant="secondary"
          busy={busy === 'maintenance'}
          disabled={busy !== null}
          onPress={() =>
            maintenance
              ? void change('maintenance', { maintenance: { active: false } })
              : confirm(
                  'Avviare la manutenzione?',
                  'Chi non è amministratore potrà solo consultare i dati finché non la termini.',
                  'Avvia',
                  () => void change('maintenance', { maintenance: { active: true, message } }),
                )
          }
        />
      </View>
      <ErrorBox message={error} />
    </Card>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm, marginTop: spacing.sm },
});
