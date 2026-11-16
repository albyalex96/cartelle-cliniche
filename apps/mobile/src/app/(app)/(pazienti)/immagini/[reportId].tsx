import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Image, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { dataUri } from '@/lib/bytes';
import { formatDate } from '@/lib/format';
import { getLocalImage, listLocalReportImages, type LocalImagingStudy } from '@/lib/local-data';
import { useLocal } from '@/lib/use-local';
import { LocalView, Message } from '@/ui/blocks';
import { spacing, useTheme } from '@/ui/theme';

interface Page {
  instanceId: string;
  study: LocalImagingStudy;
}

/** Una pagina del visualizzatore: l'immagine (letta dalla copia cifrata solo quando serve), ingrandibile. */
function ImagePage({ instanceId, width, height }: { instanceId: string; width: number; height: number }) {
  const t = useTheme();
  const image = useLocal(() => getLocalImage(instanceId), [instanceId]);
  return (
    <ScrollView
      style={{ width, height }}
      contentContainerStyle={styles.center}
      maximumZoomScale={6}
      minimumZoomScale={1}
      centerContent
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
    >
      {image.status === 'ready' && image.data ? (
        <Image source={{ uri: dataUri(image.data.mimeType, image.data.data) }} style={{ width, height }} resizeMode="contain" />
      ) : image.status === 'loading' ? (
        <ActivityIndicator color={t.primary} />
      ) : (
        <Message>Immagine non disponibile.</Message>
      )}
    </ScrollView>
  );
}

function studyLabel(st: LocalImagingStudy) {
  return [st.description || 'Immagini', st.studyDate ? formatDate(st.studyDate) : null].filter(Boolean).join(' · ');
}

/** Immagini collegate al referto: si scorrono in orizzontale, una alla volta, con lo zoom a due dita. */
export default function ImagesScreen() {
  const t = useTheme();
  const { width, height } = useWindowDimensions();
  const { reportId } = useLocalSearchParams<{ reportId: string }>();
  const result = useLocal(() => listLocalReportImages(reportId), [reportId]);
  const [index, setIndex] = useState(0);
  const pageHeight = height - 160;

  return (
    <View style={[styles.flex, { backgroundColor: t.dark ? '#000' : t.background }]}>
      <Stack.Screen options={{ title: 'Immagini' }} />
      <LocalView result={result}>
        {(studies) => {
          const pages: Page[] = studies.flatMap((study) => study.instanceIds.map((instanceId) => ({ instanceId, study })));
          const missing = studies.reduce((n, s) => n + s.total - s.instanceIds.length, 0);
          if (!pages.length) {
            return <Message>{missing ? 'Le immagini non sono ancora state scaricate: si scaricano alla prossima sincronizzazione.' : 'Nessuna immagine.'}</Message>;
          }
          const current = pages[Math.min(index, pages.length - 1)]!;
          return (
            <>
              <View style={styles.info}>
                <Text style={{ color: t.text, fontWeight: '600' }} numberOfLines={1}>
                  {studyLabel(current.study)}
                </Text>
                <Text style={{ color: t.muted }}>
                  {Math.min(index, pages.length - 1) + 1} / {pages.length}
                  {missing ? ` · ${missing} da scaricare` : ''}
                </Text>
              </View>
              <FlatList
                data={pages}
                keyExtractor={(p) => p.instanceId}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                initialNumToRender={1}
                windowSize={3}
                maxToRenderPerBatch={2}
                getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
                onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
                renderItem={({ item }) => <ImagePage instanceId={item.instanceId} width={width} height={pageHeight} />}
              />
            </>
          );
        }}
      </LocalView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  info: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: 2 },
});
