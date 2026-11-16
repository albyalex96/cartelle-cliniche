import { formatUnit, type LabTrendDTO } from '@alby/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { SectionList, StyleSheet, View } from 'react-native';
import { formatDate } from '@/lib/format';
import { listLocalTrends } from '@/lib/local-data';
import { useLocal } from '@/lib/use-local';
import { Badge, LocalView, Message, Row, SectionTitle } from '@/ui/blocks';
import { spacing, useTheme } from '@/ui/theme';

function sections(trends: LabTrendDTO[]) {
  const map = new Map<string, LabTrendDTO[]>();
  for (const tr of trends) map.set(tr.category, [...(map.get(tr.category) ?? []), tr]);
  return [...map].map(([title, data]) => ({ title, data }));
}

/** Tutti gli esami del paziente, per categoria, con l'ultimo valore: toccandone uno si vede il grafico. */
export default function TrendsScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const result = useLocal(() => listLocalTrends(id), [id]);
  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <Stack.Screen options={{ title: 'Andamento degli esami' }} />
      <LocalView result={result}>
        {(trends) =>
          trends.length === 0 ? (
            <Message>Nessun valore di laboratorio nei referti.</Message>
          ) : (
            <SectionList
              sections={sections(trends)}
              keyExtractor={(tr) => `${tr.key}|${tr.unit ?? ''}`}
              contentContainerStyle={styles.list}
              stickySectionHeadersEnabled={false}
              renderSectionHeader={({ section }) => <SectionTitle>{section.title}</SectionTitle>}
              renderItem={({ item }) => {
                const last = item.points.at(-1)!;
                return (
                  <Row
                    title={item.label}
                    subtitle={`${last.value}${item.unit ? ` ${formatUnit(item.unit)}` : ''} · ${formatDate(last.date)} · ${
                      item.points.length === 1 ? '1 valore' : `${item.points.length} valori`
                    }`}
                    badge={last.outOfRange ? <Badge label="fuori range" tone="warning" /> : undefined}
                    onPress={() =>
                      router.push({ pathname: '/paziente/[id]/esame/[key]', params: { id, key: item.key, unit: item.unit ?? '' } })
                    }
                  />
                );
              }}
            />
          )
        }
      </LocalView>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.md, gap: spacing.sm },
});
