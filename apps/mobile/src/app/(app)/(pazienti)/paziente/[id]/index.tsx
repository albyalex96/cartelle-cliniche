import { SEX_LABELS } from '@alby/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import { ageFrom, formatDate } from '@/lib/format';
import { getLocalPatient, listLocalMedications, listLocalReports } from '@/lib/local-data';
import { deleteOutbox, listOutbox, type OutboxItem } from '@/lib/outbox';
import { onlineErrorMessage, useApi } from '@/lib/online';
import { useSession } from '@/lib/session';
import { useSync } from '@/lib/sync-context';
import { useLocal } from '@/lib/use-local';
import { Badge, Card, Detail, LocalView, Message, Row, SectionTitle } from '@/ui/blocks';
import { Menu } from '@/ui/menu';
import { ReportCard, YearDivider } from '@/ui/report-card';
import { spacing, useTheme } from '@/ui/theme';
import { useBottomSpace } from '@/ui/tab-bar';
import { ChartLine, CloudUpload, FilePlus, Images, Pencil, Pill, Trash2 } from 'lucide-react-native';

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

/** Eliminazione del paziente (solo amministratori), con doppia conferma: si perdono tutti i suoi dati. */
function askDeletePatient(name: string, remove: () => Promise<unknown>, syncNow: () => Promise<unknown>) {
  Alert.alert('Eliminare il paziente?', `${name} verrà eliminato con tutti i suoi referti, terapie, documenti e immagini.`, [
    { text: 'Annulla', style: 'cancel' },
    {
      text: 'Continua',
      style: 'destructive',
      onPress: () =>
        Alert.alert('Confermi l’eliminazione?', 'L’operazione non si può annullare.', [
          { text: 'Annulla', style: 'cancel' },
          {
            text: 'Elimina',
            style: 'destructive',
            onPress: () =>
              void remove()
                .then(async () => {
                  router.back();
                  await syncNow();
                })
                .catch((err: unknown) => Alert.alert('Eliminazione non riuscita', onlineErrorMessage(err))),
          },
        ]),
    },
  ]);
}

/** Scheda del paziente: dati anagrafici, terapie in corso, andamento degli esami e referti. */
export default function PatientScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const result = useLocal(() => loadPatientPage(id), [id]);
  const bottom = useBottomSpace();
  const { syncNow } = useSync();
  const { send } = useApi();
  const isAdmin = useSession().user?.role === 'ADMIN';
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
                            {
                              label: 'Nuova terapia',
                              icon: Pill,
                              onPress: () => router.push({ pathname: '/paziente/[id]/nuova-terapia', params: { id } }),
                            },
                            {
                              label: 'Modifica dati',
                              icon: Pencil,
                              onPress: () => router.push({ pathname: '/dati-paziente', params: { id } }),
                            },
                            ...(isAdmin
                              ? [
                                  {
                                    label: 'Elimina paziente',
                                    icon: Trash2,
                                    onPress: () => askDeletePatient(title, () => send('DELETE', `/patients/${encodeURIComponent(id)}`), syncNow),
                                  },
                                ]
                              : []),
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
                  <Row
                    icon={Images}
                    title="Immagini"
                    subtitle="TAC, radiografie, ecografie…: si consultano online"
                    onPress={() => router.push({ pathname: '/paziente/[id]/immagini', params: { id } })}
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
              renderItem={({ item, index }) => {
                const year = item.examDate.slice(0, 4);
                // Primo referto di un anno (l'elenco è dal più recente): sopra va il separatore dell'anno.
                const firstOfYear = index === 0 || reports[index - 1]!.examDate.slice(0, 4) !== year;
                return (
                  <>
                    {firstOfYear ? <YearDivider year={year} count={reports.filter((r) => r.examDate.startsWith(year)).length} /> : null}
                    <ReportCard report={item} onPress={() => router.push({ pathname: '/referto/[id]', params: { id: item.id } })} />
                  </>
                );
              }}
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
