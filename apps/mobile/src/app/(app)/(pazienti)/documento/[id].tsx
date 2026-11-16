import type { File } from 'expo-file-system';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import PdfRendererView from 'react-native-pdf-renderer';
import { dataUri } from '@/lib/bytes';
import { getLocalFile } from '@/lib/local-data';
import { deleteTempDocument, writeTempDocument } from '@/lib/temp-documents';
import { useLocal } from '@/lib/use-local';
import { LocalView, Message } from '@/ui/blocks';
import { spacing, useTheme } from '@/ui/theme';

/** PDF: file temporaneo nella cache privata, cancellato alla chiusura della schermata. */
function PdfViewer({ data }: { data: Uint8Array }) {
  const [file, setFile] = useState<File | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let written: File | null = null;
    try {
      written = writeTempDocument(data, 'pdf');
      setFile(written);
    } catch {
      setFailed(true);
    }
    return () => deleteTempDocument(written);
  }, [data]);
  if (failed) return <Message>Impossibile aprire il PDF.</Message>;
  if (!file) return null;
  return (
    <PdfRendererView
      style={styles.flex}
      source={file.uri}
      distanceBetweenPages={12}
      maxZoom={6}
      onError={() => setFailed(true)}
    />
  );
}

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
