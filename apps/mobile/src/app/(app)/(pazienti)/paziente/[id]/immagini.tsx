import type { DicomUploadResultDTO, ImagingStudyDTO } from '@alby/shared';
import * as DocumentPicker from 'expo-document-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { FileUp, Images } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import { getLocalPatient } from '@/lib/local-data';
import { appendFile } from '@/lib/new-report';
import { onlineErrorMessage, useApi, useOnline } from '@/lib/online';
import { useSync } from '@/lib/sync-context';
import { useLocal } from '@/lib/use-local';
import { Badge, Message, OnlineView, Row } from '@/ui/blocks';
import { Button } from '@/ui/controls';
import { studyLabel } from '@/ui/images-viewer';
import { useBottomSpace } from '@/ui/tab-bar';
import { spacing, useTheme } from '@/ui/theme';

/** File DICOM inviati per richiesta: un CD intero si carica a gruppi, come nella webapp. */
const BATCH = 10;
const UPLOAD_TIMEOUT_MS = 180_000;

/**
 * Tutti gli studi di immagini del paziente (anche quelli non collegati a un referto, che il telefono non conserva):
 * si consultano e gestiscono online. Da qui si caricano anche file DICOM scelti sul telefono.
 */
export default function PatientImagesScreen() {
  const t = useTheme();
  const bottom = useBottomSpace();
  const { id } = useLocalSearchParams<{ id: string }>();
  const patient = useLocal(() => getLocalPatient(id), [id]);
  const canEdit = patient.status === 'ready' && !!patient.data?.canEdit;
  const { state, reload } = useOnline<ImagingStudyDTO[]>(`/patients/${encodeURIComponent(id)}/imaging`);
  const { send } = useApi();
  const { syncNow } = useSync();
  const [progress, setProgress] = useState<string | null>(null);

  async function uploadDicom() {
    const picked = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true, type: '*/*' });
    if (picked.canceled || !picked.assets.length) return;
    const files = picked.assets;
    const total: DicomUploadResultDTO = { added: 0, duplicates: 0, rejected: [] };
    try {
      for (let i = 0; i < files.length; i += BATCH) {
        setProgress(`Invio dei file: ${Math.min(i + BATCH, files.length)} di ${files.length}…`);
        const form = new FormData();
        for (const f of files.slice(i, i + BATCH)) {
          appendFile(form, 'files', f.uri, f.name);
        }
        const res = await send<DicomUploadResultDTO>('POST', `/patients/${encodeURIComponent(id)}/dicom`, { form, timeoutMs: UPLOAD_TIMEOUT_MS });
        total.added += res.added;
        total.duplicates += res.duplicates;
        total.rejected.push(...res.rejected);
      }
      const lines = [
        `${total.added} immagini aggiunte.`,
        total.duplicates ? `${total.duplicates} erano già presenti.` : '',
        total.rejected.length ? `${total.rejected.length} file scartati (non sono immagini DICOM valide).` : '',
      ];
      Alert.alert('Caricamento completato', lines.filter(Boolean).join('\n'));
    } catch (err) {
      Alert.alert('Caricamento non riuscito', onlineErrorMessage(err));
    } finally {
      setProgress(null);
      reload();
      void syncNow();
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <Stack.Screen options={{ title: 'Immagini' }} />
      <OnlineView state={state} reload={reload}>
        {(studies) => (
          <FlatList
            data={studies}
            keyExtractor={(s) => s.id}
            contentContainerStyle={[styles.list, { paddingBottom: bottom }]}
            ListHeaderComponent={
              canEdit ? (
                <View style={styles.header}>
                  <Button title="Carica file DICOM" icon={FileUp} variant="secondary" busy={!!progress} onPress={() => void uploadDicom()} />
                  {progress ? <Message>{progress}</Message> : null}
                </View>
              ) : undefined
            }
            ListEmptyComponent={<Message>Nessuna immagine.</Message>}
            renderItem={({ item }) => (
              <Row
                icon={Images}
                title={studyLabel(item)}
                subtitle={[item.modalities.join(', '), `${item.imageCount} immagini`, item.institution].filter(Boolean).join(' · ')}
                badge={item.reportId ? <Badge label="Con referto" tone="primary" /> : undefined}
                onPress={() => router.push({ pathname: '/studio/[id]', params: { id: item.id } })}
              />
            )}
          />
        )}
      </OnlineView>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.md, gap: spacing.sm },
  header: { gap: spacing.sm, marginBottom: spacing.sm },
});
