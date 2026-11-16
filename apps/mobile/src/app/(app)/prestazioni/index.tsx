import type { HealthServiceDTO, HealthServiceListDTO } from '@alby/shared';
import { router, Stack } from 'expo-router';
import { ClipboardList } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { formatEuro } from '@/lib/format';
import { usePagedSearch } from '@/lib/online';
import { Badge, Message, Row } from '@/ui/blocks';
import { Button, ErrorBox, SearchField } from '@/ui/controls';
import { useBottomSpace } from '@/ui/tab-bar';
import { spacing, useTheme } from '@/ui/theme';

/** Catalogo delle prestazioni specialistiche della Regione Puglia, consultato online. */
export default function ServicesScreen() {
  const t = useTheme();
  const bottom = useBottomSpace();
  const [query, setQuery] = useState('');
  const [catalogReady, setCatalogReady] = useState(true);
  const [total, setTotal] = useState<number | null>(null);
  const search = usePagedSearch<HealthServiceListDTO, HealthServiceDTO>(
    query,
    (q, page) => `/services?${new URLSearchParams({ ...(q ? { q } : {}), page: String(page) })}`,
    (res, page) => {
      setCatalogReady(res.catalogReady);
      setTotal(res.total);
      return { items: res.items, hasMore: page * res.pageSize < res.total };
    },
  );

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
            <ErrorBox message={search.error} />
            {search.error ? <Button title="Riprova" variant="secondary" onPress={search.retry} /> : null}
            {!catalogReady ? <Message>Il catalogo delle prestazioni non è ancora stato scaricato sul server.</Message> : null}
            {total !== null && catalogReady && !search.error ? <Message>{total.toLocaleString('it-IT')} prestazioni</Message> : null}
          </View>
        }
        ListEmptyComponent={!search.loading && !search.error && catalogReady ? <Message>Nessuna prestazione trovata.</Message> : undefined}
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
