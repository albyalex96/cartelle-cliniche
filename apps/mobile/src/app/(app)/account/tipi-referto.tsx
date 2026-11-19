import { reportTemplatesToJson, type ReportTemplateDTO } from '@alby/shared';
import { Stack } from 'expo-router';
import { FileInput, Share2, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, ScrollView, Share, StyleSheet, View } from 'react-native';
import { listLocalTemplates } from '@/lib/local-data';
import { onlineErrorMessage, useApi } from '@/lib/online';
import { useSync } from '@/lib/sync-context';
import { useLocal } from '@/lib/use-local';
import { Card, LocalView, Message, SectionTitle } from '@/ui/blocks';
import { Button, ErrorBox, Field } from '@/ui/controls';
import { TEMPLATE_ICONS } from '@/ui/icons';
import { Menu } from '@/ui/menu';
import { useBottomSpace } from '@/ui/tab-bar';
import { spacing, useTheme } from '@/ui/theme';

/**
 * Tipi di referto (solo amministratori): si esportano e importano come codice JSON (lo stesso della webapp) e si
 * eliminano. I campi si modificano dalla webapp, più comoda per un editor di questo tipo.
 */
export default function TemplatesScreen() {
  const t = useTheme();
  const bottom = useBottomSpace();
  const { send } = useApi();
  const { syncNow } = useSync();
  const result = useLocal(listLocalTemplates, []);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const share = (templates: ReportTemplateDTO[]) => void Share.share({ message: reportTemplatesToJson(templates) }).catch(() => {});

  async function importCode() {
    setImporting(true);
    setError(null);
    try {
      const res = await send<{ created: string[] }>('POST', '/admin/report-templates/import', { body: { text: code } });
      setCode('');
      await syncNow();
      Alert.alert('Importazione completata', `Aggiunti: ${res.created.join(', ')}`);
    } catch (err) {
      setError(onlineErrorMessage(err));
    } finally {
      setImporting(false);
    }
  }

  const remove = (tpl: ReportTemplateDTO) =>
    Alert.alert('Eliminare il tipo di referto?', `«${tpl.name}»: i referti già salvati conservano i loro campi.`, [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Elimina',
        style: 'destructive',
        onPress: () =>
          void send('DELETE', `/admin/report-templates/${encodeURIComponent(tpl.id)}`)
            .then(() => syncNow())
            .catch((err: unknown) => Alert.alert('Eliminazione non riuscita', onlineErrorMessage(err))),
      },
    ]);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.background }} behavior="padding">
      <Stack.Screen options={{ title: 'Tipi di referto' }} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottom }]} keyboardShouldPersistTaps="handled">
        <LocalView result={result}>
          {(templates) => (
            <>
              {templates.length ? (
                <Button title="Esporta tutti" icon={Share2} variant="secondary" onPress={() => share(templates)} />
              ) : (
                <Message>Nessun tipo di referto.</Message>
              )}
              {templates.map((tpl) => {
                const Icon = TEMPLATE_ICONS[tpl.icon];
                return (
                  <Card
                    key={tpl.id}
                    title={tpl.name}
                    subtitle={[tpl.description, `${tpl.fields.length} campi`].filter(Boolean).join(' · ')}
                    action={
                      <View style={styles.actions}>
                        {Icon ? <Icon size={20} color={t.primary} /> : null}
                        <Menu
                          items={[
                            { label: 'Esporta', icon: Share2, onPress: () => share([tpl]) },
                            { label: 'Elimina', icon: Trash2, onPress: () => remove(tpl) },
                          ]}
                        />
                      </View>
                    }
                  >
                    {null}
                  </Card>
                );
              })}
            </>
          )}
        </LocalView>

        <SectionTitle>Importa</SectionTitle>
        <Field
          label="Codice dei tipi di referto (JSON)"
          placeholder="Incolla qui il codice esportato"
          value={code}
          onChangeText={setCode}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.code}
        />
        <ErrorBox message={error} />
        <Button title="Importa" icon={FileInput} busy={importing} disabled={!code.trim()} onPress={() => void importCode()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.md },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  code: { minHeight: 140, paddingTop: spacing.sm, textAlignVertical: 'top', fontFamily: 'monospace', fontSize: 13 },
});
