import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { listLocalPatients, type LocalPatient } from '@/lib/local-data';
import { useSession } from '@/lib/session';
import { useSync } from '@/lib/sync-context';
import { Button } from '@/ui/controls';
import { radius, spacing, useTheme } from '@/ui/theme';

const dateTime = new Intl.DateTimeFormat('it-IT', { dateStyle: 'short', timeStyle: 'short' });

/** Elenco dei pazienti dalla copia locale; trascinando in basso si sincronizza. */
export default function HomeScreen() {
  const t = useTheme();
  const { signOut } = useSession();
  const { syncing, syncedAt, error, pendingFiles, version, syncNow } = useSync();
  const [patients, setPatients] = useState<LocalPatient[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    listLocalPatients()
      .then(setPatients)
      .catch(() => setLoadError('Impossibile leggere i dati salvati sul telefono.'));
  }, [version]);

  const status = error
    ? error.message
    : syncedAt
      ? `Aggiornato il ${dateTime.format(new Date(syncedAt))}${pendingFiles ? ` · ${pendingFiles} documenti da scaricare` : ''}`
      : syncing
        ? 'Primo scaricamento dei dati…'
        : '';

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: t.background }}>
      <Stack.Screen options={{ title: 'Pazienti' }} />
      <FlatList
        data={patients ?? []}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={syncing} onRefresh={syncNow} />}
        ListHeaderComponent={
          <Text style={[styles.status, { color: error && !error.offline ? t.danger : t.muted }]}>{loadError ?? status}</Text>
        }
        ListEmptyComponent={
          patients && !syncing ? (
            <Text style={[styles.status, { color: t.muted }]}>Nessun paziente disponibile per il tuo account.</Text>
          ) : undefined
        }
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
            <Text style={[styles.name, { color: t.text }]}>
              {item.lastName} {item.firstName}
            </Text>
            <Text style={{ color: t.muted }}>
              {item.reportCount} referti · {item.activeMedicationCount} terapie in corso
            </Text>
          </View>
        )}
        ListFooterComponent={
          <View style={styles.footer}>
            <Button title="Esci dall’account" variant="secondary" onPress={signOut} />
            <Text style={[styles.note, { color: t.muted }]}>Uscendo, i dati salvati sul telefono vengono cancellati.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.md, gap: spacing.sm },
  status: { fontSize: 14, paddingVertical: spacing.sm },
  card: { padding: spacing.md, borderRadius: radius, borderWidth: 1, gap: spacing.xs },
  name: { fontSize: 18, fontWeight: '600' },
  footer: { marginTop: spacing.lg, gap: spacing.sm },
  note: { fontSize: 13, textAlign: 'center' },
});
