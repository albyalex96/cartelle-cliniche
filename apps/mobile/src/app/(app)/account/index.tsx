import { ROLE_LABELS } from '@alby/shared';
import { Stack } from 'expo-router';
import { LogOut, RefreshCw } from 'lucide-react-native';
import { Alert, ScrollView, StyleSheet, Text } from 'react-native';
import { useSession } from '@/lib/session';
import { useSync } from '@/lib/sync-context';
import { Card, Detail } from '@/ui/blocks';
import { Button, ErrorBox } from '@/ui/controls';
import { ServerModesCard } from '@/ui/server-modes-card';
import { useBottomSpace } from '@/ui/tab-bar';
import { spacing, useTheme } from '@/ui/theme';

const dateTime = new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: 'short' });

/** Account: chi è collegato, a quale server, stato della copia sul telefono e uscita. */
export default function AccountScreen() {
  const t = useTheme();
  const bottom = useBottomSpace();
  const { user, server, signOut } = useSession();
  const { syncing, syncedAt, error, pendingFiles, pendingReports, syncNow } = useSync();

  // Uscendo si cancella la copia sul telefono, compresi i referti salvati offline e non ancora inviati.
  const confirmSignOut = () =>
    pendingReports
      ? Alert.alert(
          'Referti non ancora inviati',
          `${pendingReports === 1 ? 'Un referto salvato sul telefono non è' : `${pendingReports} referti salvati sul telefono non sono`} ancora stati inviati: uscendo andranno persi.`,
          [
            { text: 'Annulla', style: 'cancel' },
            { text: 'Esci comunque', style: 'destructive', onPress: () => void signOut() },
          ],
        )
      : void signOut();
  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={[styles.content, { paddingBottom: bottom }]}>
      <Stack.Screen options={{ title: 'Account' }} />
      <Card>
        <Detail label="Nome" value={user?.displayName} />
        <Detail label="Email" value={user?.email} />
        <Detail label="Ruolo" value={user ? ROLE_LABELS[user.role] : null} />
        <Detail label="Server" value={server} />
      </Card>

      <Card title="Dati sul telefono" subtitle="Pazienti, referti, terapie, documenti e immagini, cifrati e disponibili anche senza connessione.">
        <Detail label="Ultimo aggiornamento" value={syncedAt ? dateTime.format(new Date(syncedAt)) : 'Mai'} />
        <Detail label="Da scaricare" value={pendingFiles ? `${pendingFiles} tra documenti e immagini` : null} />
        <Detail label="Da inviare" value={pendingReports ? (pendingReports === 1 ? '1 nuovo referto' : `${pendingReports} nuovi referti`) : null} />
        <ErrorBox message={error?.message ?? null} />
        <Button title="Sincronizza ora" icon={RefreshCw} variant="secondary" busy={syncing} onPress={syncNow} />
      </Card>

      {user?.role === 'ADMIN' ? <ServerModesCard /> : null}

      <Button title="Esci dall’account" icon={LogOut} variant="secondary" onPress={confirmSignOut} />
      <Text style={[styles.note, { color: t.muted }]}>Uscendo, i dati salvati sul telefono vengono cancellati.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.md },
  note: { fontSize: 13, textAlign: 'center' },
});
