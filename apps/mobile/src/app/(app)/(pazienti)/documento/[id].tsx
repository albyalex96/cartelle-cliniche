import { Stack, useLocalSearchParams } from 'expo-router';
import { Image, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { dataUri } from '@/lib/bytes';
import { getLocalFile } from '@/lib/local-data';
import { useLocal } from '@/lib/use-local';
import { LocalView } from '@/ui/blocks';
import { PdfViewer } from '@/ui/pdf-viewer';
import { spacing, useTheme } from '@/ui/theme';

/** Documento originale del referto (PDF o foto), dalla copia cifrata sul telefono. */
export default function DocumentScreen() {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();
  const result = useLocal(() => getLocalFile(id), [id]);
  return (
    <View style={[styles.flex, { backgroundColor: t.background }]}>
      <Stack.Screen options={{ title: title || 'Documento' }} />
      <LocalView result={result} empty="Documento non ancora scaricato: si scarica alla prossima sincronizzazione con la rete.">
        {(file) =>
          file.mimeType === 'image/jpeg' ? (
            <ScrollView maximumZoomScale={5} minimumZoomScale={1} contentContainerStyle={styles.image}>
              <Image
                source={{ uri: dataUri(file.mimeType, file.data) }}
                style={{ width: width - spacing.md * 2, aspectRatio: 0.71 }}
                resizeMode="contain"
                accessibilityLabel="Foto del referto"
              />
            </ScrollView>
          ) : (
            <PdfViewer data={file.data} />
          )
        }
      </LocalView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  image: { padding: spacing.md, alignItems: 'center' },
});
