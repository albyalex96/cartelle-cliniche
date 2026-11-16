import {
  effectiveReportFields,
  isBlockReportField,
  REPORT_KIND_LABELS,
  reportFieldValue,
  standardReportFieldDefs,
  type ReportDTO,
  type ReportField,
} from '@alby/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatDate } from '@/lib/format';
import { countLocalReportImages, getLocalReport } from '@/lib/local-data';
import { useLocal } from '@/lib/use-local';
import { Badge, Card, Detail, LocalView } from '@/ui/blocks';
import { Button } from '@/ui/controls';
import { FileText, Image as ImageIcon, Images } from 'lucide-react-native';
import { LabResults } from '@/ui/lab-results';
import { RichText } from '@/ui/rich-text';
import { spacing, useTheme } from '@/ui/theme';
import { useBottomSpace } from '@/ui/tab-bar';


/** Valore di un campo breve, come va mostrato (come nella webapp). */
function shownValue(f: ReportField, value: string) {
  if (f.type === 'date') return formatDate(value);
  if (f.type === 'checkbox') return value === 'true' ? 'Sì' : '';
  return value;
}

function Details({ report, fields }: { report: ReportDTO; fields: ReportField[] }) {
  return (
    <>
      {fields.map((f) => (
        <Detail key={f.key} label={f.label} value={shownValue(f, reportFieldValue(f, report))} />
      ))}
    </>
  );
}

const resultsSummary = (report: ReportDTO) =>
  `${report.results.length} valori${report.outOfRangeCount > 0 ? `, ${report.outOfRangeCount} fuori dai valori di riferimento` : ''}`;

function BlockValue({ report, field }: { report: ReportDTO; field: ReportField }) {
  const t = useTheme();
  if (field.type === 'lab_table') return <LabResults results={report.results} />;
  const value = reportFieldValue(field, report);
  return field.type === 'rich_text' ? (
    <RichText text={value} />
  ) : (
    <Text selectable style={{ color: t.text, fontSize: 16, lineHeight: 23 }}>
      {value}
    </Text>
  );
}

function ReportBody({ report, imageCount }: { report: ReportDTO; imageCount: number }) {
  const t = useTheme();
  // Come nella webapp: i campi con cui è stato salvato, più quelli standard che hanno un valore.
  const fields = effectiveReportFields(report.fields, standardReportFieldDefs(), report);
  const hasValue = (f: ReportField) => reportFieldValue(f, report) !== '';
  const categoryKeys = new Set(report.categories.map((c) => c.key));
  const loose = fields.filter((f) => !categoryKeys.has(f.category));
  const groups = report.categories
    .map((category) => ({ category, fields: fields.filter((f) => f.category === category.key && (!isBlockReportField(f) || hasValue(f))) }))
    .filter((g) => g.fields.some(hasValue));

  return (
    <>
      <View style={styles.badges}>
        <Badge label={report.templateName || REPORT_KIND_LABELS[report.kind]} />
        {report.outOfRangeCount > 0 && <Badge label={`${report.outOfRangeCount} fuori range`} tone="warning" />}
      </View>

      <Card>
        <Detail label="Data dell’esame" value={formatDate(report.examDate)} />
        <Details report={report} fields={loose.filter((f) => !isBlockReportField(f))} />
      </Card>

      {(report.file || imageCount > 0) && (
        <View style={styles.buttons}>
          {report.file && (
            <View style={styles.button}>
              <Button
                title={report.file.mimeType === 'image/jpeg' ? 'Foto' : 'PDF'}
                icon={report.file.mimeType === 'image/jpeg' ? ImageIcon : FileText}
                variant="secondary"
                onPress={() => router.push({ pathname: '/documento/[id]', params: { id: report.file!.id, title: report.title } })}
              />
            </View>
          )}
          {imageCount > 0 && (
            <View style={styles.button}>
              <Button
                title={`Immagini (${imageCount})`}
                icon={Images}
                variant="secondary"
                onPress={() => router.push({ pathname: '/immagini/[reportId]', params: { reportId: report.id } })}
              />
            </View>
          )}
        </View>
      )}

      {loose
        .filter((f) => isBlockReportField(f) && hasValue(f))
        .map((f) => (
          <Card key={f.key} title={f.label} subtitle={f.type === 'lab_table' ? resultsSummary(report) : undefined}>
            <BlockValue report={report} field={f} />
          </Card>
        ))}

      {groups.map(({ category, fields: own }) => (
        <Card key={category.key} title={category.name} subtitle={category.description || undefined}>
          <Details report={report} fields={own.filter((f) => !isBlockReportField(f))} />
          {own.filter(isBlockReportField).map((f) => (
            <View key={f.key} style={styles.block}>
              <Text style={[styles.blockLabel, { color: t.muted }]}>
                {f.label}
                {f.type === 'lab_table' ? ` · ${resultsSummary(report)}` : ''}
              </Text>
              <BlockValue report={report} field={f} />
            </View>
          ))}
        </Card>
      ))}

      {report.notes ? (
        <Card title="Note personali">
          <Text selectable style={{ color: t.text, fontSize: 16, lineHeight: 23 }}>
            {report.notes}
          </Text>
        </Card>
      ) : null}
    </>
  );
}

export default function ReportScreen() {
  const t = useTheme();
  const bottom = useBottomSpace();
  const { id } = useLocalSearchParams<{ id: string }>();
  const result = useLocal(async () => {
    const report = await getLocalReport(id);
    return report && { report, imageCount: await countLocalReportImages(id) };
  }, [id]);
  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={[styles.content, { paddingBottom: bottom }]}>
      <Stack.Screen options={{ title: result.status === 'ready' && result.data ? result.data.report.title : 'Referto' }} />
      <LocalView result={result} empty="Referto non disponibile: forse è stato eliminato.">
        {({ report, imageCount }) => <ReportBody report={report} imageCount={imageCount} />}
      </LocalView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.sm },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  buttons: { flexDirection: 'row', gap: spacing.sm },
  button: { flex: 1 },
  block: { gap: spacing.xs, marginTop: spacing.sm },
  blockLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
});
