import { Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { getLocalService } from '@/lib/catalog';
import { formatDate, formatEuro } from '@/lib/format';
import { useLocal } from '@/lib/use-local';
import { Badge, Card, Detail, LocalView } from '@/ui/blocks';
import { useBottomSpace } from '@/ui/tab-bar';
import { spacing, useTheme } from '@/ui/theme';

const ACCESS = { P: 'Solo primo accesso', C: 'Solo controllo' } as const;

/** Scheda di una prestazione del catalogo regionale (copia sul telefono). */
export default function ServiceScreen() {
  const t = useTheme();
  const bottom = useBottomSpace();
  const { id } = useLocalSearchParams<{ id: string }>();
  const result = useLocal(() => getLocalService(id), [id]);
  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={[styles.content, { paddingBottom: bottom }]}>
      <Stack.Screen options={{ title: 'Prestazione' }} />
      <LocalView result={result} empty="Prestazione non presente nel catalogo salvato sul telefono.">
        {(s) => (
        <>
          <Text selectable style={[styles.title, { color: t.text }]}>
            {s.name}
          </Text>
          <View style={styles.badges}>
            {s.validTo ? <Badge label={`Cessata il ${formatDate(s.validTo)}`} /> : <Badge label="In vigore" tone="primary" />}
            {s.tariff !== null && <Badge label={formatEuro(s.tariff)} tone="primary" />}
          </View>
          <Card title="Codici">
            <Detail label="Codice del nomenclatore (DPCM 2017)" value={s.code} />
            <Detail label="Codice regionale" value={s.regionalCode} />
            <Detail label="Codice alfanumerico" value={s.alphaCode} />
            <Detail label="Vecchio codice (DPCM 1996)" value={s.oldCode} />
          </Card>
          <Card title="Dettagli">
            <Detail label="Denominazione del nomenclatore" value={s.nomenclatureName} />
            <Detail label="Denominazione breve" value={s.shortName} />
            <Detail label="Branche" value={s.branches.join(', ')} />
            <Detail label="Accesso" value={s.accessType ? ACCESS[s.accessType] : null} />
            <Detail label="Ciclo di terapia" value={s.therapeuticCycle ? 'Sì' : null} />
            <Detail label="Valida dal" value={formatDate(s.validFrom)} />
            <Detail label="Note" value={s.notes} />
          </Card>
          <Text style={[styles.note, { color: t.muted }]}>Catalogo e nomenclatore tariffario della Regione Puglia (portale SIST).</Text>
        </>
        )}
      </LocalView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.sm },
  title: { fontSize: 20, fontWeight: '700' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  note: { fontSize: 12, textAlign: 'center', marginTop: spacing.md },
});
