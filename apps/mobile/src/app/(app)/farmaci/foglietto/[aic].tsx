import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { ApiError } from '@/lib/api';
import { openLeaflet } from '@/lib/catalog';
import { onlineErrorMessage, useApi } from '@/lib/online';
import { ErrorBox } from '@/ui/controls';
import { PdfViewer } from '@/ui/pdf-viewer';
import { spacing, useTheme } from '@/ui/theme';

/**
 * Foglietto illustrativo del farmaco (PDF AIFA scaricato dal server). Resta sul telefono dopo la prima apertura
 * (e per i farmaci in terapia è già scaricato), così si legge anche offline.
 */
export default function LeafletScreen() {
  const t = useTheme();
  const { download } = useApi();
  const { aic, name } = useLocalSearchParams<{ aic: string; name?: string }>();
  const [data, setData] = useState<Uint8Array | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    openLeaflet(aic, async () => (await download(`/drugs/${encodeURIComponent(aic)}/leaflet`)).data)
      .then(setData)
      .catch((err: unknown) =>
        setError(
          err instanceof ApiError && err.offline
            ? 'Serve la connessione: questo foglietto non è ancora stato scaricato sul telefono.'
            : onlineErrorMessage(err),
        ),
      );
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
