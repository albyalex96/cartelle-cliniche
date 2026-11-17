import { REPORT_KIND_LABELS, SEX_LABELS } from '@alby/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import { ageFrom, formatDate } from '@/lib/format';
import { getLocalPatient, listLocalMedications, listLocalReports } from '@/lib/local-data';
import { deleteOutbox, listOutbox, type OutboxItem } from '@/lib/outbox';
import { useSync } from '@/lib/sync-context';
import { useLocal } from '@/lib/use-local';
import { Badge, Card, Detail, LocalView, Message, Row, SectionTitle } from '@/ui/blocks';
import { TEMPLATE_ICONS } from '@/ui/icons';
import { Menu } from '@/ui/menu';
import { spacing, useTheme } from '@/ui/theme';
import { useBottomSpace } from '@/ui/tab-bar';
import { ChartLine, CloudUpload, FilePlus, Pill } from 'lucide-react-native';

async function loadPatientPage(id: string) {
  const [patient, reports, medications, outbox] = await Promise.all([getLocalPatient(id), listLocalReports(id), listLocalMedications(id), listOutbox(id)]);
  return patient && { patient, reports, medications, outbox };
}

/** Referto salvato offline: si può riprovare subito l'invio o eliminarlo (con conferma). */
function askOutbox(item: OutboxItem, retry: () => void) {
  Alert.alert(item.title || 'Referto da inviare', item.error ?? 'Verrà inviato da solo appena torna la connessione.', [
    { text: 'Chiudi', style: 'cancel' },
    {
      text: 'Elimina',
      style: 'destructive',
      onPress: () =>
        Alert.alert('Eliminare il referto?', 'Non è ancora stato inviato: eliminandolo si perde, con i suoi allegati.', [
          { text: 'Annulla', style: 'cancel' },
          { text: 'Elimina', style: 'destructive', onPress: () => void deleteOutbox(item.id).then(retry) },
        ]),
    },
    { text: 'Riprova ora', onPress: retry },
  ]);
}

/** Scheda del paziente: dati anagrafici, terapie in corso, andamento degli esami e referti. */
export default function PatientScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const result = useLocal(() => loadPatientPage(id), [id]);
  const bottom = useBottomSpace();
  const { syncNow } = useSync();
  const title = result.status === 'ready' && result.data ? `${result.data.patient.lastName} ${result.data.patient.firstName}` : 'Paziente';

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <Stack.Screen options={{ title }} />
      <LocalView result={result} empty="Paziente non disponibile: forse l’accesso è stato revocato.">
        {({ patient, reports, medications, outbox }) => {
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
                  <Card
                    action={
                      patient.canEdit ? (
                        <Menu
                          items={[
                            {
                              label: 'Nuovo referto',
                              icon: FilePlus,
                              onPress: () => router.push({ pathname: '/paziente/[id]/nuovo-referto', params: { id } }),
                            },
                          ]}
                        />
                      ) : undefined
                    }
                  >
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

                  {outbox.length ? (
                    <>
                      <SectionTitle>Da inviare</SectionTitle>
                      {outbox.map((item) => (
                        <Row
                          key={item.id}
                          icon={CloudUpload}
                          iconTone="warning"
                          title={item.title || 'Referto senza titolo'}
                          subtitle={[formatDate(item.examDate), item.error ? `Non inviato: ${item.error}` : 'In attesa di connessione'].filter(Boolean).join(' · ')}
                          badge={<Badge label={item.error ? 'Errore' : 'Da inviare'} tone="warning" />}
                          onPress={() => askOutbox(item, () => void syncNow())}
                        />
                      ))}
                    </>
                  ) : null}

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
