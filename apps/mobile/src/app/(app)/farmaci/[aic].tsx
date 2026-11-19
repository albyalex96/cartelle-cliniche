import { router, Stack, useLocalSearchParams } from 'expo-router';
import { FileText, Pill } from 'lucide-react-native';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { getLocalDrug } from '@/lib/catalog';
import { useLocal } from '@/lib/use-local';
import { Card, Detail, LocalView, Row, SectionTitle } from '@/ui/blocks';
import { Button } from '@/ui/controls';
import { useBottomSpace } from '@/ui/tab-bar';
import { spacing, useTheme } from '@/ui/theme';

/** Scheda di un farmaco (copia sul telefono): dati AIFA, forme e dosaggi, foglietto illustrativo. */
export default function DrugScreen() {
  const t = useTheme();
  const bottom = useBottomSpace();
  const { aic, name } = useLocalSearchParams<{ aic: string; name?: string }>();
  const result = useLocal(() => getLocalDrug(aic), [aic]);
  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={[styles.content, { paddingBottom: bottom }]}>
      <Stack.Screen options={{ title: result.status === 'ready' && result.data ? result.data.name : name || 'Farmaco' }} />
      <LocalView result={result} empty="Farmaco non presente nell’elenco salvato sul telefono.">
        {(drug) => (
          <>
            <Card>
              <Detail label="Principio attivo" value={drug.activeIngredient} />
              <Detail label="Azienda" value={drug.holder} />
              <Detail label="Codice AIC" value={drug.aic} />
            </Card>
            {drug.hasLeaflet && (
              <Button
                title="Foglietto illustrativo"
                icon={FileText}
                onPress={() => router.push({ pathname: '/farmaci/foglietto/[aic]', params: { aic: drug.aic, name: drug.name } })}
              />
            )}
            {drug.variants.length > 0 && <SectionTitle>Forme e dosaggi ({drug.variants.length})</SectionTitle>}
            {drug.variants.map((v, i) => (
              <Row key={i} icon={Pill} iconTone="muted" title={v.strength ?? 'Dosaggio non indicato'} subtitle={v.form ?? undefined} />
            ))}
            <Text style={[styles.note, { color: t.muted }]}>Dati AIFA, licenza CC BY 4.0.</Text>
          </>
        )}
      </LocalView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.sm },
  note: { fontSize: 12, textAlign: 'center', marginTop: spacing.md },
});
