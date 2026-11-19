import { REPORT_KIND_LABELS, type ReportSummaryDTO } from '@alby/shared';
import { ChevronRight, CircleCheck, FlaskConical, MapPin, Paperclip, Stethoscope, TriangleAlert, type LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { TEMPLATE_ICONS } from './icons';
import { glassEdge, radius, spacing, useTheme } from './theme';

const DAY = new Intl.DateTimeFormat('it-IT', { day: 'numeric', timeZone: 'UTC' });
const MONTH = new Intl.DateTimeFormat('it-IT', { month: 'short', timeZone: 'UTC' });

/** Intestazione di un anno nello storico: l'anno, una riga sottile e quanti referti contiene. */
export function YearDivider({ year, count }: { year: string; count: number }) {
  const t = useTheme();
  return (
    <View style={styles.year}>
      <Text style={{ color: t.text, fontSize: 14, fontWeight: '700', letterSpacing: 0.5, fontVariant: ['tabular-nums'] }}>{year}</Text>
      <View style={[styles.yearLine, { backgroundColor: t.border }]} />
      <Text style={{ color: t.muted, fontSize: 12 }}>{count === 1 ? '1 referto' : `${count} referti`}</Text>
    </View>
  );
}

function Chip({ icon: Icon, label, fg, bg }: { icon: LucideIcon; label: string; fg: string; bg: string }) {
  return (
    <View style={[styles.chip, { backgroundColor: bg }]}>
      <Icon size={12} color={fg} strokeWidth={2.4} />
      <Text style={{ color: fg, fontSize: 12, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

function Meta({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  const t = useTheme();
  return (
    <View style={styles.meta}>
      <Icon size={13} color={t.muted} />
      <Text numberOfLines={1} style={{ color: t.muted, fontSize: 13, flexShrink: 1 }}>
        {text}
      </Text>
    </View>
  );
}

/**
 * Un referto nello storico del paziente: riquadro con la data, tipo con la sua icona, titolo, struttura e
 * medico, stato dei valori (con una barra che mostra la quota fuori range) e documento allegato.
 */
export function ReportCard({ report: r, onPress }: { report: ReportSummaryDTO; onPress(): void }) {
  const t = useTheme();
  const date = new Date(`${r.examDate}T00:00:00Z`);
  const flagged = r.outOfRangeCount > 0;
  const accent = flagged ? t.warning : t.primary;
  const TypeIcon = TEMPLATE_ICONS[r.templateIcon];
  const outShare = r.resultCount ? Math.max(4, Math.round((r.outOfRangeCount / r.resultCount) * 100)) : 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${r.title}, ${date.toLocaleDateString('it-IT', { timeZone: 'UTC' })}${flagged ? `, ${r.outOfRangeCount} fuori range` : ''}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, glassEdge(t), { backgroundColor: pressed ? t.background : t.surface, borderLeftColor: accent }]}
    >
      <View style={[styles.date, { backgroundColor: flagged ? t.warningSurface : t.primarySurface }]}>
        <Text style={{ color: t.text, fontSize: 22, fontWeight: '700', lineHeight: 24, fontVariant: ['tabular-nums'] }}>{DAY.format(date)}</Text>
        <Text style={{ color: accent, fontSize: 11, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' }}>
          {MONTH.format(date).replace('.', '')}
        </Text>
        <Text style={{ color: t.muted, fontSize: 10, fontVariant: ['tabular-nums'] }}>{r.examDate.slice(0, 4)}</Text>
      </View>

      <View style={styles.body}>
        <View style={styles.kind}>
          <TypeIcon size={12} color={t.primary} strokeWidth={2.4} />
          <Text numberOfLines={1} style={{ color: t.primary, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', flexShrink: 1 }}>
            {r.templateName || REPORT_KIND_LABELS[r.kind]}
          </Text>
        </View>
        <Text style={{ color: t.text, fontSize: 16, fontWeight: '600', lineHeight: 21 }}>{r.title}</Text>
        {r.facility ? <Meta icon={MapPin} text={r.facility} /> : null}
        {r.doctor ? <Meta icon={Stethoscope} text={r.doctor} /> : null}

        {r.resultCount > 0 || r.fileId ? (
          <View style={styles.chips}>
            {r.resultCount > 0 ? <Chip icon={FlaskConical} label={r.resultCount === 1 ? '1 valore' : `${r.resultCount} valori`} fg={t.primary} bg={t.primarySurface} /> : null}
            {flagged ? (
              <Chip icon={TriangleAlert} label={`${r.outOfRangeCount} fuori range`} fg={t.warning} bg={t.warningSurface} />
            ) : r.resultCount > 0 ? (
              <Chip icon={CircleCheck} label="Tutti nella norma" fg={t.success} bg={t.successSurface} />
            ) : null}
            {r.fileId ? <Chip icon={Paperclip} label="Originale" fg={t.muted} bg={t.background} /> : null}
          </View>
        ) : null}

        {r.resultCount > 0 ? (
          <View style={[styles.bar, { backgroundColor: t.successSurface }]}>
            {flagged ? <View style={[styles.barOut, { backgroundColor: t.warning, width: `${outShare}%` }]} /> : null}
          </View>
        ) : null}
      </View>

      <ChevronRight size={20} color={t.muted} style={{ alignSelf: 'center' }} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', gap: spacing.sm + 4, padding: 12, borderRadius: radius, borderLeftWidth: 4 },
  date: { width: 56, borderRadius: 12, paddingVertical: 8, alignItems: 'center', alignSelf: 'flex-start' },
  body: { flex: 1, gap: 4, minWidth: 0 },
  kind: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  bar: { height: 4, borderRadius: 2, overflow: 'hidden', marginTop: 6, flexDirection: 'row', justifyContent: 'flex-end' },
  barOut: { height: '100%', borderRadius: 2 },
  year: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  yearLine: { flex: 1, height: StyleSheet.hairlineWidth },
});
