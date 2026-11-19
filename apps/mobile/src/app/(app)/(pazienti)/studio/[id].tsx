import type { ImagingStudyDetailDTO } from '@alby/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { FileText, Pencil, Trash2 } from 'lucide-react-native';
import { Alert, StyleSheet, View } from 'react-native';
import { onlineErrorMessage, useApi, useOnline } from '@/lib/online';
import { useSync } from '@/lib/sync-context';
import { OnlineView } from '@/ui/blocks';
import { ImagesViewer, studyLabel } from '@/ui/images-viewer';
import { Menu, type MenuItem } from '@/ui/menu';
import { useTheme } from '@/ui/theme';

/** Uno studio di immagini (online), con modifica, collegamento al referto ed eliminazione per chi può modificarlo. */
export default function StudyScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const path = `/imaging-studies/${encodeURIComponent(id)}`;
  const { state, reload } = useOnline<ImagingStudyDetailDTO>(path);
  const { send } = useApi();
  const { syncNow } = useSync();
  const study = state.status === 'ready' ? state.data : null;

  const remove = () =>
    send('DELETE', path)
      .then(async () => {
        router.back();
        await syncNow();
      })
      .catch((err: unknown) => Alert.alert('Eliminazione non riuscita', onlineErrorMessage(err)));

  const items: MenuItem[] = [];
  if (study?.report) {
    const reportId = study.report.id;
    items.push({ label: 'Apri il referto', icon: FileText, onPress: () => router.push({ pathname: '/referto/[id]', params: { id: reportId } }) });
  }
  if (study?.canEdit) {
    items.push(
      { label: 'Nome e referto collegato', icon: Pencil, onPress: () => router.push({ pathname: '/studio/modifica', params: { id } }) },
      {
        label: 'Elimina',
        icon: Trash2,
        onPress: () =>
          Alert.alert('Eliminare le immagini?', `«${studyLabel(study)}» verrà eliminato con tutte le sue immagini.`, [
            { text: 'Annulla', style: 'cancel' },
            { text: 'Elimina', style: 'destructive', onPress: () => void remove() },
          ]),
      },
    );
  }

  return (
    <View style={[styles.flex, { backgroundColor: t.dark ? '#000' : t.background }]}>
      <Stack.Screen
        options={{ title: study ? studyLabel(study) : 'Immagini', headerRight: items.length ? () => <Menu items={items} /> : undefined }}
      />
      <OnlineView state={state} reload={reload}>
        {(s) => (
          <ImagesViewer
            pages={s.series.flatMap((se) => {
              const label = [se.description || (se.number !== null ? `Serie ${se.number}` : null), se.modality].filter(Boolean).join(' · ');
              return se.instances.map((i) => ({ instanceId: i.id, label: label || studyLabel(s) }));
            })}
          />
        )}
      </OnlineView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
