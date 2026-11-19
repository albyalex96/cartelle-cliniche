import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { dataUri } from '@/lib/bytes';
import { formatDate } from '@/lib/format';
import { getLocalImage } from '@/lib/local-data';
import { useApi } from '@/lib/online';
import { Message } from './blocks';
import { spacing, useTheme } from './theme';

/** Nome e data di uno studio di immagini. */
export function studyLabel(st: { description: string | null; studyDate: string | null }) {
  return [st.description || 'Immagini', st.studyDate ? formatDate(st.studyDate) : null].filter(Boolean).join(' · ');
}

/** Un'immagine da mostrare, con la descrizione dello studio a cui appartiene. */
export interface ViewerPage {
  instanceId: string;
  label: string;
}

/**
 * Una pagina del visualizzatore, ingrandibile: l'immagine si legge dalla copia cifrata solo quando serve; se non è
 * sul telefono (studio non collegato a un referto, o non ancora scaricato) si chiede al server, senza salvarla.
 */
function ImagePage({ instanceId, width, height }: { instanceId: string; width: number; height: number }) {
  const t = useTheme();
  const { download } = useApi();
  const [image, setImage] = useState<{ mimeType: string; data: Uint8Array } | null | 'loading'>('loading');
  useEffect(() => {
    let current = true;
    setImage('loading');
    getLocalImage(instanceId)
      .then((local) => local ?? download(`/images/${encodeURIComponent(instanceId)}`))
      .then((found) => current && setImage(found))
      .catch(() => current && setImage(null));
    return () => {
      current = false;
    };
  }, [instanceId, download]);
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
      {image === 'loading' ? (
        <ActivityIndicator color={t.primary} />
      ) : image ? (
        <Image source={{ uri: dataUri(image.mimeType, image.data) }} style={{ width, height }} resizeMode="contain" />
      ) : (
        <Message>Immagine non disponibile.</Message>
      )}
    </ScrollView>
  );
}

/** Immagini che si scorrono in orizzontale, una alla volta, con lo zoom a due dita. `note`: es. quante mancano. */
export function ImagesViewer({ pages, note }: { pages: ViewerPage[]; note?: string }) {
  const t = useTheme();
  const { width, height } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  if (!pages.length) return <Message>Nessuna immagine.</Message>;
  const shown = Math.min(index, pages.length - 1);
  return (
    <>
      <View style={styles.info}>
        <Text style={{ color: t.text, fontWeight: '600' }} numberOfLines={1}>
          {pages[shown]!.label}
        </Text>
        <Text style={{ color: t.muted }}>
          {shown + 1} / {pages.length}
          {note ? ` · ${note}` : ''}
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
        renderItem={({ item }) => <ImagePage instanceId={item.instanceId} width={width} height={height - 160} />}
      />
    </>
  );
}

const styles = StyleSheet.create({
  center: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  info: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: 2 },
});
