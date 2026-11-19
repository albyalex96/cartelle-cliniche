import type { MedicationDTO } from '@alby/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { CircleStop, Pencil, Trash2 } from 'lucide-react-native';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatDate } from '@/lib/format';
import { getLocalPatient, listLocalMedications } from '@/lib/local-data';
import { onlineErrorMessage, useApi } from '@/lib/online';
import { useSync } from '@/lib/sync-context';
import { useLocal } from '@/lib/use-local';
import { Badge, Card, Detail, LocalView, Message, SectionTitle } from '@/ui/blocks';
import { Menu, type MenuItem } from '@/ui/menu';
import { spacing, useTheme } from '@/ui/theme';
import { useBottomSpace } from '@/ui/tab-bar';


function period(m: MedicationDTO) {
  if (m.startDate && m.endDate) return `Dal ${formatDate(m.startDate)} al ${formatDate(m.endDate)}`;
  if (m.startDate) return `Dal ${formatDate(m.startDate)}`;
  if (m.endDate) return `Fino al ${formatDate(m.endDate)}`;
  return null;
}

/** Modifica, sospensione ed eliminazione (servono la connessione e il permesso di modifica). */
function useMedicationActions(m: MedicationDTO): MenuItem[] {
  const { send } = useApi();
  const { syncNow } = useSync();
  const run = (method: 'POST' | 'DELETE', path: string) =>
    send(method, path)
      .then(() => syncNow())
      .catch((err: unknown) => Alert.alert('Operazione non riuscita', onlineErrorMessage(err)));
  const path = `/medications/${encodeURIComponent(m.id)}`;
  return [
    {
      label: 'Modifica',
      icon: Pencil,
      onPress: () => router.push({ pathname: '/paziente/[id]/nuova-terapia', params: { id: m.patientId, medicationId: m.id } }),
    },
    ...(m.active
      ? [
          {
            label: 'Sospendi da oggi',
            icon: CircleStop,
            onPress: () =>
              Alert.alert('Sospendere la terapia?', `${m.name} risulterà conclusa da oggi.`, [
                { text: 'Annulla', style: 'cancel' },
                { text: 'Sospendi', onPress: () => void run('POST', `${path}/stop`) },
              ]),
          },
        ]
      : []),
    {
      label: 'Elimina',
      icon: Trash2,
      onPress: () =>
        Alert.alert('Eliminare la terapia?', `${m.name} verrà eliminata definitivamente.`, [
          { text: 'Annulla', style: 'cancel' },
          { text: 'Elimina', style: 'destructive', onPress: () => void run('DELETE', path) },
        ]),
    },
  ];
}

function MedicationMenu({ m }: { m: MedicationDTO }) {
  return <Menu items={useMedicationActions(m)} />;
}

function MedicationCard({ m, canEdit }: { m: MedicationDTO; canEdit: boolean }) {
  const t = useTheme();
  const dose = [m.dosage, m.frequency].filter(Boolean).join(', ');
  return (
    <Card action={canEdit ? <MedicationMenu m={m} /> : undefined}>
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
      {m.leafletUrl && m.aic ? (
        <Text
          accessibilityRole="link"
          style={{ color: t.primary, fontWeight: '600' }}
          onPress={() => router.push({ pathname: '/farmaci/foglietto/[aic]', params: { aic: m.aic!.slice(0, 6), name: m.name } })}
        >
          Foglietto illustrativo
        </Text>
      ) : null}
    </Card>
  );
}

/** Terapie del paziente: in corso e concluse. */
export default function TherapiesScreen() {
  const t = useTheme();
  const bottom = useBottomSpace();
  const { id } = useLocalSearchParams<{ id: string }>();
  const result = useLocal(async () => {
    const [patient, medications] = await Promise.all([getLocalPatient(id), listLocalMedications(id)]);
    return { medications, canEdit: patient?.canEdit ?? false };
  }, [id]);
  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={[styles.list, { paddingBottom: bottom }]}>
      <Stack.Screen options={{ title: 'Terapie' }} />
      <LocalView result={result}>
        {({ medications, canEdit }) => {
          const active = medications.filter((m) => m.active);
          const ended = medications.filter((m) => !m.active);
          if (!medications.length) return <Message>Nessuna terapia registrata.</Message>;
          return (
            <>
              <SectionTitle>In corso ({active.length})</SectionTitle>
              {active.length ? active.map((m) => <MedicationCard key={m.id} m={m} canEdit={canEdit} />) : <Message>Nessuna terapia in corso.</Message>}
              {ended.length > 0 && <SectionTitle>Concluse ({ended.length})</SectionTitle>}
              {ended.map((m) => (
                <MedicationCard key={m.id} m={m} canEdit={canEdit} />
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
