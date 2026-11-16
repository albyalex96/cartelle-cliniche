import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { onlineErrorMessage, useApi } from '@/lib/online';
import { ErrorBox } from '@/ui/controls';
import { PdfViewer } from '@/ui/pdf-viewer';
import { spacing, useTheme } from '@/ui/theme';

/** Foglietto illustrativo del farmaco (PDF AIFA scaricato dal server), solo online. */
export default function LeafletScreen() {
  const t = useTheme();
  const { download } = useApi();
  const { aic, name } = useLocalSearchParams<{ aic: string; name?: string }>();
  const [data, setData] = useState<Uint8Array | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    download(`/drugs/${encodeURIComponent(aic)}/leaflet`)
      .then((res) => setData(res.data))
      .catch((err: unknown) => setError(onlineErrorMessage(err)));
  }, [download, aic]);
  return (
    <View style={[styles.flex, { backgroundColor: t.background }]}>
      <Stack.Screen options={{ title: name ? `Foglietto: ${name}` : 'Foglietto illustrativo' }} />
      {error ? (
        <View style={styles.pad}>
          <ErrorBox message={error} />
        </View>
      ) : data ? (
        <PdfViewer data={data} />
      ) : (
        <ActivityIndicator color={t.primary} style={styles.pad} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pad: { padding: spacing.md, marginTop: spacing.lg },
});
