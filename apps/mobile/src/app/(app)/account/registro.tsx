import { AUDIT_ACTION_LABELS, AUDIT_FILTERS, type AuditEntryDTO, type Paginated } from '@alby/shared';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ShieldBan, ShieldCheck } from 'lucide-react-native';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { onlineErrorMessage, useApi, useOnline } from '@/lib/online';
import { Badge, Card, Message } from '@/ui/blocks';
import { Menu } from '@/ui/menu';
import { Chips } from '@/ui/controls';
import { useBottomSpace } from '@/ui/tab-bar';
import { spacing, useTheme } from '@/ui/theme';

const PAGE_SIZE = 30;
const dateTime = new Intl.DateTimeFormat('it-IT', { dateStyle: 'short', timeStyle: 'medium' });

/** Su chi si è agito: il paziente o l'utente a cui la voce si riferisce (solo nomi, mai dati sanitari). */
function subject(e: AuditEntryDTO): string | null {
  const d = (e.details ?? {}) as Record<string, unknown>;
  if (e.action === 'patient.deleted') return typeof d.name === 'string' ? d.name : 'Paziente eliminato';
  if (e.patientId) return e.patientName ?? 'Paziente non più presente';
  if (e.entity === 'user' && e.action !== 'setup.admin_created') return e.targetUserName ?? (typeof d.email === 'string' ? d.email : null);
  return null;
}

type BlockedIps = { ips: string[]; ownIp: string | null };

/** Stessa forma degli indirizzi bloccati (come `normalizeIp` sul server, per i casi comuni). */
const normalizeIp = (ip: string) => ip.trim().toLowerCase().replace(/%.*$/, '').replace(/^::ffff:(?=\d+\.)/, '');

/** Blocco o sblocco di un indirizzo, con conferma (il server rifiuta comunque il proprio indirizzo). */
function askBlock(ip: string, blocked: boolean, setBlocked: (ip: string, blocked: boolean) => Promise<void>) {
  Alert.alert(
    blocked ? `Sbloccare ${ip}?` : `Bloccare ${ip}?`,
    blocked ? 'Da questo indirizzo si potrà di nuovo accedere.' : 'Le richieste da questo indirizzo verranno rifiutate e le sue sessioni chiuse.',
    [
      { text: 'Annulla', style: 'cancel' },
      { text: blocked ? 'Sblocca' : 'Blocca', style: blocked ? 'default' : 'destructive', onPress: () => void setBlocked(ip, !blocked) },
    ],
  );
}

function Entry({ e, blocked, setBlocked }: { e: AuditEntryDTO; blocked: BlockedIps | null; setBlocked: (ip: string, blocked: boolean) => Promise<void> }) {
  const t = useTheme();
  const alarming = e.action === 'auth.login_failed' || e.action.endsWith('.deleted');
  const ip = e.ip ? normalizeIp(e.ip) : null;
  const isBlocked = !!ip && !!blocked?.ips.includes(ip);
  const canAct = ip && blocked && ip !== blocked.ownIp;
  return (
    <Card
      action={
        canAct ? (
          <Menu
            items={[
              {
                label: isBlocked ? `Sblocca ${ip}` : `Blocca ${ip}`,
                icon: isBlocked ? ShieldCheck : ShieldBan,
                onPress: () => askBlock(ip, isBlocked, setBlocked),
              },
            ]}
          />
        ) : undefined
      }
    >
      {isBlocked ? <Badge label="IP bloccato" tone="warning" /> : null}
      <Text style={{ color: alarming ? t.danger : t.text, fontWeight: '600', fontSize: 15 }}>{AUDIT_ACTION_LABELS[e.action] ?? e.action}</Text>
      <Text style={{ color: t.muted }}>
        {[dateTime.format(new Date(e.createdAt)), e.userName ?? 'Sistema', subject(e), e.ip].filter(Boolean).join(' · ')}
      </Text>
    </Card>
  );
}

/** Registro accessi (solo amministratori, online), filtrabile per tipo di attività, a pagine; da qui si bloccano gli IP. */
export default function AuditScreen() {
  const t = useTheme();
  const bottom = useBottomSpace();
  const { get, send } = useApi();
  const blockedIps = useOnline<BlockedIps>('/admin/blocked-ips');
  const blocked = blockedIps.state.status === 'ready' ? blockedIps.state.data : null;
  const setBlocked = async (ip: string, block: boolean) => {
    try {
      await send('POST', '/admin/blocked-ips', { body: { ip, blocked: block } });
    } catch (err) {
      Alert.alert('Operazione non riuscita', onlineErrorMessage(err));
    }
    blockedIps.reload();
  };
  const [filter, setFilter] = useState('all');
  const [items, setItems] = useState<AuditEntryDTO[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (next: number, f: string) => {
      setLoading(true);
      setError(null);
      try {
        const query = new URLSearchParams({ page: String(next), pageSize: String(PAGE_SIZE), ...(f === 'all' ? {} : { action: `${f}.` }) });
        const res = await get<Paginated<AuditEntryDTO>>(`/admin/audit?${query}`);
        setItems((prev) => (next === 1 ? res.items : [...prev, ...res.items]));
        setTotal(res.total);
        setPage(next);
      } catch (err) {
        setError(onlineErrorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [get],
  );

  useEffect(() => {
    setItems([]);
    setTotal(null);
    void load(1, filter);
  }, [filter, load]);

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <Stack.Screen options={{ title: 'Registro accessi' }} />
      <FlatList
        data={items}
        keyExtractor={(e) => e.id}
        contentContainerStyle={[styles.list, { paddingBottom: bottom }]}
        ListHeaderComponent={
          <View style={styles.header}>
            <Chips options={AUDIT_FILTERS.map((f) => ({ value: f.value, label: f.label }))} value={filter} onChange={setFilter} />
            {blocked?.ips.length ? (
              <Card title="Indirizzi bloccati">
                {blocked.ips.map((ip) => (
                  <Text key={ip} accessibilityRole="button" onPress={() => askBlock(ip, true, setBlocked)} style={{ color: t.text, fontSize: 15 }}>
                    {ip} · <Text style={{ color: t.primary, fontWeight: '600' }}>Sblocca</Text>
                  </Text>
                ))}
              </Card>
            ) : null}
            {total !== null ? <Message>{total === 1 ? '1 attività' : `${total.toLocaleString('it-IT')} attività`}</Message> : null}
            {error ? <Text style={{ color: t.danger, textAlign: 'center' }}>{error}</Text> : null}
          </View>
        }
        ListEmptyComponent={!loading && total === 0 ? <Message>Nessuna attività.</Message> : undefined}
        ListFooterComponent={loading ? <ActivityIndicator color={t.primary} style={{ margin: spacing.md }} /> : undefined}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (!loading && total !== null && items.length < total) void load(page + 1, filter);
        }}
        renderItem={({ item }) => <Entry e={item} blocked={blocked} setBlocked={setBlocked} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.md, gap: spacing.sm },
  header: { gap: spacing.sm, marginBottom: spacing.sm },
});
