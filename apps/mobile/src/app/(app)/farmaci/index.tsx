import { router, Stack } from 'expo-router';
import { Pill } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { searchLocalDrugs } from '@/lib/catalog';
import { useSync } from '@/lib/sync-context';
import { useLocalSearch } from '@/lib/use-local';
import { Badge, Message, Row } from '@/ui/blocks';
import { ErrorBox, SearchField } from '@/ui/controls';
import { useBottomSpace } from '@/ui/tab-bar';
import { spacing, useTheme } from '@/ui/theme';

/** Elenco dei farmaci autorizzati in Italia (dati AIFA), dalla copia sul telefono: funziona anche offline. */
export default function DrugsScreen() {
  const t = useTheme();
  const bottom = useBottomSpace();
  const [query, setQuery] = useState('');
  const { syncing } = useSync();
  const search = useLocalSearch(query, searchLocalDrugs);
  const missing = search.result !== null && !search.result.downloaded;
  const empty = search.result?.empty ?? false;

  return (
    <View style={[styles.flex, { backgroundColor: t.background }]}>
      <Stack.Screen options={{ title: 'Farmaci' }} />
      <FlatList
        data={search.items}
        keyExtractor={(d) => d.aic}
        contentContainerStyle={[styles.list, { paddingBottom: bottom }]}
        keyboardShouldPersistTaps="handled"
        onEndReached={search.loadMore}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          <View style={styles.header}>
            <SearchField value={query} onChangeText={setQuery} placeholder="Nome o principio attivo" />
            <ErrorBox message={search.failed ? 'Lettura dell’elenco non riuscita.' : null} />
            {missing ? (
              <Message>
                {syncing ? 'Sto scaricando l’elenco dei farmaci sul telefono…' : 'L’elenco dei farmaci si scarica sul telefono alla prima sincronizzazione con la connessione.'}
              </Message>
            ) : null}
            {empty ? <Message>L’elenco dei farmaci non è ancora stato scaricato sul server.</Message> : null}
          </View>
        }
        ListEmptyComponent={!search.loading && !search.failed && !missing && !empty ? <Message>Nessun farmaco trovato.</Message> : undefined}
        ListFooterComponent={search.loading ? <ActivityIndicator color={t.primary} style={styles.loading} /> : undefined}
        renderItem={({ item }) => (
          <Row
            icon={Pill}
            iconTone={item.withdrawn ? 'muted' : 'primary'}
            title={item.name}
            subtitle={[item.activeIngredient, item.forms.slice(0, 2).join(', '), item.holder].filter(Boolean).join(' · ')}
            badge={item.withdrawn ? <Badge label="Non autorizzato" /> : undefined}
            onPress={() => router.push({ pathname: '/farmaci/[aic]', params: { aic: item.aic, name: item.name } })}
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
