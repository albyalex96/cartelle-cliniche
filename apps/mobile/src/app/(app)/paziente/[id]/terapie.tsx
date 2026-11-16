import type { MedicationDTO } from '@alby/shared';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatDate } from '@/lib/format';
import { listLocalMedications } from '@/lib/local-data';
import { useLocal } from '@/lib/use-local';
import { Badge, Card, Detail, LocalView, Message, SectionTitle } from '@/ui/blocks';
import { spacing, useTheme } from '@/ui/theme';

function period(m: MedicationDTO) {
  if (m.startDate && m.endDate) return `Dal ${formatDate(m.startDate)} al ${formatDate(m.endDate)}`;
  if (m.startDate) return `Dal ${formatDate(m.startDate)}`;
  if (m.endDate) return `Fino al ${formatDate(m.endDate)}`;
  return null;
}

function MedicationCard({ m }: { m: MedicationDTO }) {
  const t = useTheme();
  const dose = [m.dosage, m.frequency].filter(Boolean).join(', ');
  return (
    <Card>
      <View style={styles.titleRow}>
        <Text style={[styles.name, { color: t.text }]}>{m.name}</Text>
        {m.asNeeded ? <Badge label="Al bisogno" /> : null}
      </View>
      {m.activeIngredient ? <Text style={{ color: t.muted }}>{m.activeIngredient}</Text> : null}
      <Detail label="Come prenderlo" value={dose} />
      <Detail label="Confezione" value={[m.strength, m.form].filter(Boolean).join(' · ')} />
      <Detail label="Motivo" value={m.reason} />
      <Detail label="Prescritto da" value={m.prescriber} />
      <Detail label="Periodo" value={period(m)} />
      <Detail label="Note" value={m.notes} />
      {m.leafletUrl ? (
        <Text accessibilityRole="link" style={{ color: t.primary, fontWeight: '600' }} onPress={() => Linking.openURL(m.leafletUrl!)}>
          Foglietto illustrativo (sito AIFA) ↗
        </Text>
      ) : null}
    </Card>
  );
}

/** Terapie del paziente: in corso e concluse. */
export default function TherapiesScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const result = useLocal(() => listLocalMedications(id), [id]);
  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={styles.list}>
      <Stack.Screen options={{ title: 'Terapie' }} />
      <LocalView result={result}>
        {(medications) => {
          const active = medications.filter((m) => m.active);
          const ended = medications.filter((m) => !m.active);
          if (!medications.length) return <Message>Nessuna terapia registrata.</Message>;
          return (
            <>
              <SectionTitle>In corso ({active.length})</SectionTitle>
              {active.length ? active.map((m) => <MedicationCard key={m.id} m={m} />) : <Message>Nessuna terapia in corso.</Message>}
              {ended.length > 0 && <SectionTitle>Concluse ({ended.length})</SectionTitle>}
              {ended.map((m) => (
                <MedicationCard key={m.id} m={m} />
              ))}
            </>
          );
        }}
      </LocalView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.md, gap: spacing.sm },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  name: { fontSize: 18, fontWeight: '600', flexShrink: 1 },
});
