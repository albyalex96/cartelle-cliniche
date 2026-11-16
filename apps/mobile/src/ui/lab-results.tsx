import { formatUnit, type LabResultDTO } from '@alby/shared';
import { StyleSheet, Text, View } from 'react-native';
import { radius, spacing, useTheme } from './theme';

/**
 * Valori di un referto di laboratorio, adattati allo schermo del telefono: una riga per esame con valore e unità
 * a destra e i valori di riferimento sotto; quelli fuori range sono evidenziati. Le sezioni fanno da intestazione.
 */
export function LabResults({ results }: { results: LabResultDTO[] }) {
  const t = useTheme();
  let lastSection: string | null = null;
  return (
    <View>
      {results.map((r, i) => {
        const header = r.section && r.section !== lastSection ? r.section : null;
        lastSection = r.section;
        const out = r.outOfRange === true;
        return (
          <View key={r.id}>
            {header ? <Text style={[styles.section, { color: t.muted }]}>{header}</Text> : null}
            <View
              style={[
                styles.row,
                { borderTopColor: t.border, borderTopWidth: i === 0 || header ? 0 : StyleSheet.hairlineWidth },
                out && { backgroundColor: t.warningSurface },
              ]}
              accessible
              accessibilityLabel={`${r.name}: ${r.value} ${r.unit ?? ''}${out ? ', fuori dai valori di riferimento' : ''}`}
            >
              <View style={styles.left}>
                <Text style={[styles.name, { color: t.text }]}>{r.name}</Text>
                {r.referenceRange ? <Text style={{ color: t.muted, fontSize: 13 }}>Rif. {r.referenceRange}</Text> : null}
              </View>
              <View style={styles.right}>
                <Text selectable style={[styles.value, { color: out ? t.warning : t.text }]}>
                  {r.value}
                </Text>
                {r.unit ? <Text style={{ color: t.muted, fontSize: 13 }}>{formatUnit(r.unit)}</Text> : null}
                {out ? <Text style={{ color: t.warning, fontSize: 12, fontWeight: '600' }}>fuori range</Text> : null}
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.md, marginBottom: spacing.xs },
  row: { flexDirection: 'row', gap: spacing.sm, paddingVertical: 10, paddingHorizontal: spacing.sm, borderRadius: radius / 2 },
  left: { flex: 1, gap: 2 },
  right: { alignItems: 'flex-end', maxWidth: '45%' },
  name: { fontSize: 15, fontWeight: '500' },
  value: { fontSize: 16, fontWeight: '700' },
});
