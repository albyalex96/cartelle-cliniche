import type { DrugDetailDTO } from '@alby/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { FileText, Pill } from 'lucide-react-native';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useOnline } from '@/lib/online';
import { Card, Detail, Row, SectionTitle } from '@/ui/blocks';
import { Button, ErrorBox } from '@/ui/controls';
import { useBottomSpace } from '@/ui/tab-bar';
import { spacing, useTheme } from '@/ui/theme';

/** Scheda di un farmaco (online): dati AIFA, forme e dosaggi, foglietto illustrativo. */
export default function DrugScreen() {
  const t = useTheme();
  const bottom = useBottomSpace();
  const { aic, name } = useLocalSearchParams<{ aic: string; name?: string }>();
  const { state, reload } = useOnline<DrugDetailDTO>(`/drugs/${encodeURIComponent(aic)}`);
  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={[styles.content, { paddingBottom: bottom }]}>
      <Stack.Screen options={{ title: state.status === 'ready' ? state.data.name : name || 'Farmaco' }} />
      {state.status === 'loading' && <ActivityIndicator color={t.primary} style={styles.loading} />}
      {state.status === 'error' && (
        <View style={styles.gap}>
          <ErrorBox message={state.message} />
          <Button title="Riprova" variant="secondary" onPress={reload} />
        </View>
      )}
      {state.status === 'ready' && (
        <>
          <Card>
            <Detail label="Principio attivo" value={state.data.activeIngredient} />
            <Detail label="Azienda" value={state.data.holder} />
            <Detail label="Codice AIC" value={state.data.aic} />
          </Card>
          {state.data.hasLeaflet && (
            <Button
              title="Foglietto illustrativo"
              icon={FileText}
              onPress={() => router.push({ pathname: '/farmaci/foglietto/[aic]', params: { aic: state.data.aic, name: state.data.name } })}
            />
          )}
          {state.data.variants.length > 0 && <SectionTitle>Forme e dosaggi ({state.data.variants.length})</SectionTitle>}
          {state.data.variants.map((v, i) => (
            <Row key={i} icon={Pill} iconTone="muted" title={v.strength ?? 'Dosaggio non indicato'} subtitle={v.form ?? undefined} />
          ))}
          <Text style={[styles.note, { color: t.muted }]}>Dati AIFA, licenza CC BY 4.0.</Text>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.sm },
  gap: { gap: spacing.sm },
  loading: { marginTop: spacing.xl },
  note: { fontSize: 12, textAlign: 'center', marginTop: spacing.md },
});
