import { Stack, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { listLocalReportImages } from '@/lib/local-data';
import { useLocal } from '@/lib/use-local';
import { LocalView, Message } from '@/ui/blocks';
import { ImagesViewer, studyLabel } from '@/ui/images-viewer';
import { useTheme } from '@/ui/theme';

/** Immagini collegate al referto, dalla copia sul telefono. */
export default function ImagesScreen() {
  const t = useTheme();
  const { reportId } = useLocalSearchParams<{ reportId: string }>();
  const result = useLocal(() => listLocalReportImages(reportId), [reportId]);

  return (
    <View style={[styles.flex, { backgroundColor: t.dark ? '#000' : t.background }]}>
      <Stack.Screen options={{ title: 'Immagini' }} />
      <LocalView result={result}>
        {(studies) => {
          const pages = studies.flatMap((study) => study.instanceIds.map((instanceId) => ({ instanceId, label: studyLabel(study) })));
          const missing = studies.reduce((n, s) => n + s.total - s.instanceIds.length, 0);
          if (!pages.length && missing) return <Message>Le immagini non sono ancora state scaricate: si scaricano alla prossima sincronizzazione.</Message>;
          return <ImagesViewer pages={pages} note={missing ? `${missing} da scaricare` : undefined} />;
        }}
      </LocalView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
