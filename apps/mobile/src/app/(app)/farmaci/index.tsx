import type { DrugCatalogPageDTO, DrugSuggestionDTO } from '@alby/shared';
import { router, Stack } from 'expo-router';
import { Pill } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { usePagedSearch } from '@/lib/online';
import { Badge, Message, Row } from '@/ui/blocks';
import { Button, ErrorBox, SearchField } from '@/ui/controls';
import { useBottomSpace } from '@/ui/tab-bar';
import { spacing, useTheme } from '@/ui/theme';

/** Elenco dei farmaci autorizzati in Italia (dati AIFA), consultato online. */
export default function DrugsScreen() {
  const t = useTheme();
  const bottom = useBottomSpace();
  const [query, setQuery] = useState('');
  const [catalogReady, setCatalogReady] = useState(true);
  const [approximate, setApproximate] = useState(false);
  const search = usePagedSearch<DrugCatalogPageDTO, DrugSuggestionDTO>(
    query,
    (q, page) => `/drugs?${new URLSearchParams({ ...(q ? { q } : {}), page: String(page) })}`,
    (res) => {
      setCatalogReady(res.catalogReady);
      setApproximate(res.approximate);
      return { items: res.items, hasMore: res.hasMore };
    },
  );

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
            <ErrorBox message={search.error} />
            {search.error ? <Button title="Riprova" variant="secondary" onPress={search.retry} /> : null}
            {!catalogReady ? <Message>L’elenco dei farmaci non è ancora stato scaricato sul server.</Message> : null}
            {approximate && search.items.length ? <Message>Nessun farmaco con questo nome. Forse cercavi:</Message> : null}
          </View>
        }
        ListEmptyComponent={!search.loading && !search.error && catalogReady ? <Message>Nessun farmaco trovato.</Message> : undefined}
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
