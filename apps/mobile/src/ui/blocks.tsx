import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import type { LocalResult } from '@/lib/use-local';
import { radius, spacing, useTheme } from './theme';

/** Riquadro con titolo facoltativo. */
export function Card({ title, subtitle, children, style }: { title?: string; subtitle?: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }, style]}>
      {title ? <Text style={[styles.cardTitle, { color: t.text }]}>{title}</Text> : null}
      {subtitle ? <Text style={{ color: t.muted, fontSize: 14 }}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

/** Etichetta e valore (nessun output se il valore è vuoto). */
export function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  const t = useTheme();
  if (!value) return null;
  return (
    <View style={styles.detail}>
      <Text style={[styles.detailLabel, { color: t.muted }]}>{label}</Text>
      <Text selectable style={{ color: t.text, fontSize: 16 }}>
        {value}
      </Text>
    </View>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={styles.sectionTitle}>
      <Text style={[styles.sectionText, { color: t.muted }]}>{children}</Text>
      {right}
    </View>
  );
}

/** Riga toccabile di un elenco, con freccia. */
export function Row({
  title,
  subtitle,
  badge,
  onPress,
}: {
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  onPress?: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? t.background : t.surface, borderColor: t.border }]}
    >
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, { color: t.text }]}>{title}</Text>
        {subtitle ? <Text style={{ color: t.muted, fontSize: 14 }}>{subtitle}</Text> : null}
      </View>
      {badge}
      {onPress ? <Text style={[styles.chevron, { color: t.muted }]}>›</Text> : null}
    </Pressable>
  );
}

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'warning' | 'primary' }) {
  const t = useTheme();
  const colors =
    tone === 'warning'
      ? { bg: t.warningSurface, fg: t.warning }
      : tone === 'primary'
        ? { bg: t.primarySurface, fg: t.primary }
        : { bg: t.background, fg: t.muted };
  return (
    <View style={[styles.badge, { backgroundColor: colors.bg }]}>
      <Text style={{ color: colors.fg, fontSize: 13, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

/** Caricamento / errore della copia locale; con i dati pronti mostra `children(data)`. */
export function LocalView<T>({
  result,
  children,
  empty,
}: {
  result: LocalResult<T>;
  children: (data: NonNullable<T>) => ReactNode;
  /** Messaggio se i dati non ci sono (`null`): elemento eliminato o non più accessibile. */
  empty?: string;
}) {
  const t = useTheme();
  if (result.status === 'loading') return <ActivityIndicator style={{ marginTop: spacing.xl }} color={t.primary} />;
  if (result.status === 'error' || (result.data === null && empty === undefined)) {
    return <Text style={[styles.message, { color: t.danger }]}>Impossibile leggere i dati salvati sul telefono.</Text>;
  }
  if (result.data === null || result.data === undefined) return <Text style={[styles.message, { color: t.muted }]}>{empty}</Text>;
  return <>{children(result.data)}</>;
}

export function Message({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text style={[styles.message, { color: t.muted }]}>{children}</Text>;
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius, padding: spacing.md, gap: spacing.sm },
  cardTitle: { fontSize: 18, fontWeight: '600' },
  detail: { gap: 2 },
  detailLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md },
  sectionText: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    minHeight: 56,
  },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 16, fontWeight: '600' },
  chevron: { fontSize: 26, lineHeight: 28 },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  message: { textAlign: 'center', padding: spacing.lg, fontSize: 15 },
});
