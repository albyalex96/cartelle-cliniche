import { REPORT_KIND_LABELS, SEX_LABELS } from '@alby/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { FlatList, StyleSheet, View } from 'react-native';
import { ageFrom, formatDate } from '@/lib/format';
import { getLocalPatient, listLocalMedications, listLocalReports } from '@/lib/local-data';
import { useLocal } from '@/lib/use-local';
import { Badge, Card, Detail, LocalView, Message, Row, SectionTitle } from '@/ui/blocks';
import { TEMPLATE_ICONS } from '@/ui/icons';
import { spacing, useTheme } from '@/ui/theme';
import { useBottomSpace } from '@/ui/tab-bar';
import { ChartLine, Pill } from 'lucide-react-native';

async function loadPatientPage(id: string) {
  const [patient, reports, medications] = await Promise.all([getLocalPatient(id), listLocalReports(id), listLocalMedications(id)]);
  return patient && { patient, reports, medications };
}

/** Scheda del paziente: dati anagrafici, terapie in corso, andamento degli esami e referti. */
export default function PatientScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const result = useLocal(() => loadPatientPage(id), [id]);
  const bottom = useBottomSpace();
  const title = result.status === 'ready' && result.data ? `${result.data.patient.lastName} ${result.data.patient.firstName}` : 'Paziente';

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <Stack.Screen options={{ title }} />
      <LocalView result={result} empty="Paziente non disponibile: forse l’accesso è stato revocato.">
        {({ patient, reports, medications }) => {
          const active = medications.filter((m) => m.active);
          const age = ageFrom(patient.birthDate);
          const hasLab = reports.some((r) => r.results.length > 0);
          return (
            <FlatList
              data={reports}
              keyExtractor={(r) => r.id}
              contentContainerStyle={[styles.list, { paddingBottom: bottom }]}
              ListHeaderComponent={
                <View style={styles.header}>
                  <Card>
                    <Detail label="Data di nascita" value={patient.birthDate ? `${formatDate(patient.birthDate)}${age !== null ? ` (${age} anni)` : ''}` : null} />
                    <Detail label="Sesso" value={patient.sex ? SEX_LABELS[patient.sex] : null} />
                    <Detail label="Gruppo sanguigno" value={patient.bloodType} />
                    <Detail label="Codice fiscale" value={patient.fiscalCode} />
                    <Detail label="Telefono" value={patient.phone} />
                    <Detail label="Email" value={patient.email} />
                    <Detail label="Note" value={patient.notes} />
                  </Card>

                  <Row
                    icon={Pill}
                    title="Terapie"
                    subtitle={
                      active.length
                        ? active.map((m) => m.name).join(', ')
                        : medications.length
                          ? 'Nessuna terapia in corso'
                          : 'Nessuna terapia registrata'
                    }
                    badge={active.length ? <Badge label={`${active.length} in corso`} tone="primary" /> : undefined}
                    onPress={() => router.push({ pathname: '/paziente/[id]/terapie', params: { id } })}
                  />
                  {hasLab && (
                    <Row
                      icon={ChartLine}
                      title="Andamento degli esami"
                      subtitle="I valori nel tempo, esame per esame"
                      onPress={() => router.push({ pathname: '/paziente/[id]/andamento', params: { id } })}
                    />
                  )}

                  <SectionTitle>{reports.length === 1 ? '1 referto' : `${reports.length} referti`}</SectionTitle>
                </View>
              }
              ListEmptyComponent={<Message>Nessun referto.</Message>}
              renderItem={({ item }) => (
                <Row
                  icon={TEMPLATE_ICONS[item.templateIcon]}
                  iconTone={item.outOfRangeCount > 0 ? 'warning' : 'primary'}
                  title={item.title}
                  subtitle={[formatDate(item.examDate), item.templateName || REPORT_KIND_LABELS[item.kind], item.facility].filter(Boolean).join(' · ')}
                  badge={item.outOfRangeCount > 0 ? <Badge label={`${item.outOfRangeCount} fuori range`} tone="warning" /> : undefined}
                  onPress={() => router.push({ pathname: '/referto/[id]', params: { id: item.id } })}
                />
              )}
            />
          );
        }}
      </LocalView>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.md, gap: spacing.sm },
  header: { gap: spacing.sm },
});
