import { router, Stack } from 'expo-router';
import { ClipboardList } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { formatEuro } from '@/lib/format';
import { searchLocalServices } from '@/lib/catalog';
import { useSync } from '@/lib/sync-context';
import { useLocalSearch } from '@/lib/use-local';
import { Badge, Message, Row } from '@/ui/blocks';
import { ErrorBox, SearchField } from '@/ui/controls';
import { useBottomSpace } from '@/ui/tab-bar';
import { spacing, useTheme } from '@/ui/theme';

/** Catalogo delle prestazioni specialistiche della Regione Puglia, dalla copia sul telefono: funziona anche offline. */
export default function ServicesScreen() {
  const t = useTheme();
  const bottom = useBottomSpace();
  const [query, setQuery] = useState('');
  const { syncing } = useSync();
  const search = useLocalSearch(query, searchLocalServices);
  const missing = search.result !== null && !search.result.downloaded;
  const empty = search.result?.empty ?? false;
  const total = search.result?.total ?? null;

  return (
    <View style={[styles.flex, { backgroundColor: t.background }]}>
      <Stack.Screen options={{ title: 'Prestazioni' }} />
      <FlatList
        data={search.items}
        keyExtractor={(s) => s.id}
        contentContainerStyle={[styles.list, { paddingBottom: bottom }]}
        keyboardShouldPersistTaps="handled"
        onEndReached={search.loadMore}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          <View style={styles.header}>
            <SearchField value={query} onChangeText={setQuery} placeholder="Nome o codice (es. 89.13)" />
            <ErrorBox message={search.failed ? 'Lettura del catalogo non riuscita.' : null} />
            {missing ? (
              <Message>
                {syncing ? 'Sto scaricando il catalogo delle prestazioni sul telefono…' : 'Il catalogo si scarica sul telefono alla prima sincronizzazione con la connessione.'}
              </Message>
            ) : null}
            {empty ? <Message>Il catalogo delle prestazioni non è ancora stato scaricato sul server.</Message> : null}
            {total !== null && !missing && !empty && !search.failed ? <Message>{total.toLocaleString('it-IT')} prestazioni</Message> : null}
          </View>
        }
        ListEmptyComponent={!search.loading && !search.failed && !missing && !empty ? <Message>Nessuna prestazione trovata.</Message> : undefined}
        ListFooterComponent={search.loading ? <ActivityIndicator color={t.primary} style={styles.loading} /> : undefined}
        renderItem={({ item }) => (
          <Row
            icon={ClipboardList}
            iconTone={item.validTo ? 'muted' : 'primary'}
            title={item.name}
            subtitle={[item.code ?? item.regionalCode, item.branches.join(', '), item.tariff !== null ? formatEuro(item.tariff) : null]
              .filter(Boolean)
              .join(' · ')}
            badge={item.validTo ? <Badge label="Cessata" /> : undefined}
            onPress={() => router.push({ pathname: '/prestazioni/[id]', params: { id: item.id } })}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { padding: spacing.md, gap: spacing.sm },
  header: { gap: spacing.sm },
  loading: { marginVertical: spacing.lg },
});
