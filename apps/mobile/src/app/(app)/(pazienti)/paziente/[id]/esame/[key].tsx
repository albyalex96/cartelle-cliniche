import { formatUnit } from '@alby/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatDate } from '@/lib/format';
import { listLocalTrends } from '@/lib/local-data';
import { useLocal } from '@/lib/use-local';
import { Badge, Card, LocalView, Row, SectionTitle } from '@/ui/blocks';
import { LineChart } from '@/ui/line-chart';
import { spacing, useTheme } from '@/ui/theme';
import { useBottomSpace } from '@/ui/tab-bar';


/** Un esame nel tempo: grafico e tutti i valori, ognuno collegato al suo referto. */
export default function AnalyteScreen() {
  const t = useTheme();
  const bottom = useBottomSpace();
  const { id, key, unit } = useLocalSearchParams<{ id: string; key: string; unit?: string }>();
  const result = useLocal(
    async () => (await listLocalTrends(id)).find((tr) => tr.key === key && (tr.unit ?? '') === (unit ?? '')) ?? null,
    [id, key, unit],
  );
  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={[styles.content, { paddingBottom: bottom }]}>
      <Stack.Screen options={{ title: result.status === 'ready' && result.data ? result.data.label : 'Esame' }} />
      <LocalView result={result} empty="Esame non trovato.">
        {(trend) => (
          <>
            {trend.numericCount > 0 && (
              <Card subtitle={trend.unit ? `Unità: ${formatUnit(trend.unit)} · in azzurro i valori di riferimento` : 'In azzurro i valori di riferimento'}>
                <LineChart points={trend.points} />
              </Card>
            )}
            <SectionTitle>Valori ({trend.points.length})</SectionTitle>
            {[...trend.points].reverse().map((p, i) => (
              <Row
                key={`${p.reportId}-${i}`}
                title={`${p.value}${trend.unit ? ` ${formatUnit(trend.unit)}` : ''}`}
                subtitle={[formatDate(p.date), p.referenceRange ? `rif. ${p.referenceRange}` : null, p.reportTitle].filter(Boolean).join(' · ')}
                badge={p.outOfRange ? <Badge label="fuori range" tone="warning" /> : undefined}
                onPress={() => router.push({ pathname: '/referto/[id]', params: { id: p.reportId } })}
              />
            ))}
            {trend.points.some((p) => p.name !== trend.label) && (
              <View style={styles.note}>
                <Text style={{ color: t.muted, fontSize: 13 }}>
                  Nei referti questo esame compare anche come: {[...new Set(trend.points.map((p) => p.name))].join(', ')}.
                </Text>
              </View>
            )}
          </>
        )}
      </LocalView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.sm },
  note: { paddingHorizontal: spacing.sm },
});
