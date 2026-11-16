import { router, Stack } from 'expo-router';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { ageFrom } from '@/lib/format';
import { listLocalPatients } from '@/lib/local-data';
import { useSync } from '@/lib/sync-context';
import { useLocal } from '@/lib/use-local';
import { Badge, Row } from '@/ui/blocks';
import { spacing, useTheme } from '@/ui/theme';
import { useBottomSpace } from '@/ui/tab-bar';
import { UserRound } from 'lucide-react-native';

const dateTime = new Intl.DateTimeFormat('it-IT', { dateStyle: 'short', timeStyle: 'short' });

/** Elenco dei pazienti dalla copia locale; trascinando in basso si sincronizza. */
export default function HomeScreen() {
  const t = useTheme();
  const bottom = useBottomSpace();
  const { syncing, syncedAt, error, pendingFiles, syncNow } = useSync();
  const patients = useLocal(listLocalPatients, []);

  const status =
    patients.status === 'error'
      ? 'Impossibile leggere i dati salvati sul telefono.'
      : error
        ? error.message
        : syncedAt
          ? `Aggiornato il ${dateTime.format(new Date(syncedAt))}${pendingFiles ? ` · ${pendingFiles} documenti da scaricare` : ''}`
          : syncing
            ? 'Primo scaricamento dei dati…'
            : '';
  const statusIsError = patients.status === 'error' || (error !== null && !error.offline);

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <Stack.Screen options={{ title: 'Pazienti' }} />
      <FlatList
        data={patients.status === 'ready' ? patients.data : []}
        keyExtractor={(p) => p.id}
        contentContainerStyle={[styles.list, { paddingBottom: bottom }]}
        refreshControl={<RefreshControl refreshing={syncing} onRefresh={syncNow} colors={[t.primary]} progressBackgroundColor={t.surface} />}
        ListHeaderComponent={<Text style={[styles.status, { color: statusIsError ? t.danger : t.muted }]}>{status}</Text>}
        ListEmptyComponent={
          patients.status === 'ready' && !syncing ? (
            <Text style={[styles.status, { color: t.muted }]}>Nessun paziente disponibile per il tuo account.</Text>
          ) : undefined
        }
        renderItem={({ item }) => {
          const age = ageFrom(item.birthDate);
          return (
            <Row
              icon={UserRound}
              title={`${item.lastName} ${item.firstName}`}
              subtitle={[
                age !== null ? `${age} anni` : null,
                `${item.reportCount} referti`,
                item.activeMedicationCount ? `${item.activeMedicationCount} terapie in corso` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
              badge={item.canEdit ? undefined : <Badge label="Sola lettura" />}
              onPress={() => router.push({ pathname: '/paziente/[id]', params: { id: item.id } })}
            />
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.md, gap: spacing.sm },
  status: { fontSize: 14, paddingVertical: spacing.sm },
});
