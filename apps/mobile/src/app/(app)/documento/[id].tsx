import { Stack, useLocalSearchParams } from 'expo-router';
import { Image, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { getLocalFile } from '@/lib/local-data';
import { useLocal } from '@/lib/use-local';
import { LocalView, Message } from '@/ui/blocks';
import { spacing, useTheme } from '@/ui/theme';

/** Byte → base64 a blocchi (String.fromCharCode con troppi argomenti supera i limiti dello stack). */
function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/**
 * Documento originale del referto, dalla copia cifrata sul telefono (resta in memoria: niente file in chiaro).
 * Foto: mostrata subito. PDF: il visualizzatore arriva con la prossima versione dell'app.
 */
export default function DocumentScreen() {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();
  const result = useLocal(() => getLocalFile(id), [id]);
  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <Stack.Screen options={{ title: title || 'Documento' }} />
      <LocalView result={result} empty="Documento non ancora scaricato: si scarica alla prossima sincronizzazione con la rete.">
        {(file) =>
          file.mimeType === 'image/jpeg' ? (
            <ScrollView maximumZoomScale={4} minimumZoomScale={1} contentContainerStyle={styles.image}>
              <Image
                source={{ uri: `data:image/jpeg;base64,${toBase64(file.data)}` }}
                style={{ width: width - spacing.md * 2, aspectRatio: 0.71 }}
                resizeMode="contain"
                accessibilityLabel="Foto del referto"
              />
            </ScrollView>
          ) : (
            <Message>Il PDF è salvato sul telefono. Il visualizzatore dei PDF arriva con il prossimo aggiornamento dell’app.</Message>
          )
        }
      </LocalView>
    </View>
  );
}

const styles = StyleSheet.create({
  image: { padding: spacing.md, alignItems: 'center' },
});
