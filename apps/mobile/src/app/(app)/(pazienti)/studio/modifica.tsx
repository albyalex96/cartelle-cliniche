import { REPORT_KIND_LABELS, type ImagingStudyDetailDTO } from '@alby/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { FileText, Save, Unlink, X } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';
import { formatDate } from '@/lib/format';
import { listLocalReports } from '@/lib/local-data';
import { onlineErrorMessage, useApi, useOnline } from '@/lib/online';
import { useSync } from '@/lib/sync-context';
import { useLocal } from '@/lib/use-local';
import { Badge, Message, OnlineView, Row, SectionTitle } from '@/ui/blocks';
import { Button, ErrorBox, Field } from '@/ui/controls';
import { useBottomSpace } from '@/ui/tab-bar';
import { spacing, useTheme } from '@/ui/theme';

/** Nome dello studio di immagini e referto a cui è collegato (come nella pagina dello studio della webapp). */
export default function EditStudyScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, reload } = useOnline<ImagingStudyDetailDTO>(`/imaging-studies/${encodeURIComponent(id)}`);
  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <Stack.Screen options={{ title: 'Modifica immagini' }} />
      <OnlineView state={state} reload={reload}>
        {(study) => (study.canEdit ? <StudyForm study={study} /> : <Message>Non hai il permesso di modificare queste immagini.</Message>)}
      </OnlineView>
    </View>
  );
}

function StudyForm({ study }: { study: ImagingStudyDetailDTO }) {
  const bottom = useBottomSpace();
  const { send } = useApi();
  const { syncNow } = useSync();
  const reports = useLocal(() => listLocalReports(study.patientId), [study.patientId]);
  const [name, setName] = useState(study.description ?? '');
  const [reportId, setReportId] = useState<string | null>(study.report?.id ?? null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await send('PATCH', `/imaging-studies/${encodeURIComponent(study.id)}`, { body: { name, reportId } });
      await syncNow();
      router.back();
    } catch (err) {
      setError(onlineErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const chosen = (id: string | null) => (id === reportId ? <Badge label="Scelto" tone="primary" /> : undefined);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottom }]} keyboardShouldPersistTaps="handled">
        <Field label="Nome" placeholder="Es. TAC torace" value={name} onChangeText={setName} />

        <SectionTitle>Referto collegato</SectionTitle>
        <Row icon={Unlink} iconTone="muted" title="Nessun referto" badge={chosen(null)} onPress={() => setReportId(null)} />
        {reports.status === 'ready'
          ? reports.data.map((r) => (
              <Row
                key={r.id}
                icon={FileText}
                title={r.title}
                subtitle={[formatDate(r.examDate), r.templateName || REPORT_KIND_LABELS[r.kind]].filter(Boolean).join(' · ')}
                badge={chosen(r.id)}
                onPress={() => setReportId(r.id)}
              />
            ))
          : null}

        <ErrorBox message={error} />
        <View style={styles.pair}>
          <View style={styles.flex}>
            <Button title="Annulla" icon={X} variant="secondary" disabled={saving} onPress={() => router.back()} />
          </View>
          <View style={styles.flex}>
            <Button title="Salva" icon={Save} busy={saving} onPress={() => void save()} />
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.sm },
  pair: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  flex: { flex: 1 },
});
