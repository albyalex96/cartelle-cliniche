import { LOG_LEVEL_LABELS, LOG_LEVELS, type LogEntryDTO, type LogFilter, type LogLevel, type LogListDTO } from '@alby/shared';
import { Stack, useFocusEffect } from 'expo-router';
import { Bug, Check, CircleX, Info, Pause, Play, Server, Share2, Smartphone, Trash2, TriangleAlert, type LucideIcon } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { clearLocalLogs, exportLocalLogs, listLocalLogs } from '@/lib/logger';
import { onlineErrorMessage, useApi } from '@/lib/online';
import { useSession } from '@/lib/session';
import { Message } from '@/ui/blocks';
import { Button, Chips, SearchField } from '@/ui/controls';
import { useBottomSpace } from '@/ui/tab-bar';
import { radius, spacing, useTheme, type Theme } from '@/ui/theme';

const LIVE_EVERY_MS = 3000;
const PAGE = 200;
const KEEP = 1000;
/** Testo massimo condiviso con il menu di sistema: oltre, si tengono le voci più recenti. */
const SHARE_MAX_CHARS = 500_000;

type Where = 'phone' | 'server';

const LEVEL_ICON: Record<LogLevel, LucideIcon> = { debug: Bug, info: Info, warn: TriangleAlert, error: CircleX };
const levelColor = (t: Theme, level: LogLevel) => ({ debug: t.muted, info: t.primary, warn: t.warning, error: t.danger })[level];

const time = new Intl.DateTimeFormat('it-IT', { dateStyle: 'short', timeStyle: 'medium' });

const queryString = (filter: LogFilter, extra: Record<string, number> = {}) =>
  new URLSearchParams({
    ...(filter.levels ? { levels: filter.levels.join(',') } : {}),
    ...(filter.q ? { q: filter.q } : {}),
    ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, String(v)])),
  }).toString();

/** Stesse operazioni per i log del telefono (database locale) e per quelli del server (API, solo amministratori). */
function useLogSource(where: Where) {
  const { get, send } = useApi();
  return useMemo(
    () =>
      where === 'phone'
        ? {
            list: (f: LogFilter, page: { after?: number; before?: number; limit: number }) => listLocalLogs({ ...f, ...page }),
            clear: (f: LogFilter) => clearLocalLogs(f),
            export: (f: LogFilter) => exportLocalLogs(f),
          }
        : {
            list: (f: LogFilter, page: { after?: number; before?: number; limit: number }) =>
              get<LogListDTO>(`/admin/logs?${queryString(f, page as Record<string, number>)}`),
            clear: async (f: LogFilter) => (await send<{ deleted: number }>('DELETE', `/admin/logs?${queryString(f)}`)).deleted,
            export: (f: LogFilter) => get<{ text: string; count: number }>(`/admin/logs/export?${queryString(f)}`),
          },
    [where, get, send],
  );
}

function Entry({ e, showUser }: { e: LogEntryDTO; showUser: boolean }) {
  const t = useTheme();
  const color = levelColor(t, e.level);
  const Icon = LEVEL_ICON[e.level];
  const SourceIcon = e.source === 'mobile' ? Smartphone : Server;
  const hasDetails = !!e.details && Object.keys(e.details).length > 0;
  return (
    <Pressable
      disabled={!hasDetails}
      onPress={() => Alert.alert(LOG_LEVEL_LABELS[e.level], `${e.message}\n\n${JSON.stringify(e.details, null, 2)}`)}
      style={[styles.entry, { backgroundColor: t.surface, borderLeftColor: color }]}
    >
      <View style={styles.entryHead}>
        <Icon size={14} color={color} />
        <Text style={{ color, fontWeight: '700', fontSize: 12 }}>{LOG_LEVEL_LABELS[e.level]}</Text>
        {showUser ? <SourceIcon size={13} color={t.muted} /> : null}
        <Text style={{ color: t.muted, fontSize: 12, fontVariant: ['tabular-nums'] }}>{time.format(new Date(e.createdAt))}</Text>
        {showUser && e.userName ? (
          <Text numberOfLines={1} style={{ color: t.muted, fontSize: 12, flexShrink: 1 }}>
            · {e.userName}
          </Text>
        ) : null}
      </View>
      <Text style={{ color: t.text, fontSize: 13, fontFamily: 'monospace' }}>{e.message}</Text>
    </Pressable>
  );
}

/** Caselle dei livelli: si possono scegliere più livelli insieme, ognuno con il suo colore. */
function LevelToggles({ value, onChange }: { value: LogLevel[]; onChange(levels: LogLevel[]): void }) {
  const t = useTheme();
  return (
    <View style={styles.levels}>
      {LOG_LEVELS.map((level) => {
        const on = value.includes(level);
        const color = levelColor(t, level);
        const Icon = LEVEL_ICON[level];
        return (
          <Pressable
            key={level}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            onPress={() => onChange(on ? value.filter((l) => l !== level) : LOG_LEVELS.filter((l) => l === level || value.includes(l)))}
            style={[styles.level, { borderColor: on ? color : t.border, backgroundColor: on ? t.surface : t.background }]}
          >
            <View style={[styles.box, { borderColor: on ? color : t.border, backgroundColor: on ? color : 'transparent' }]}>
              {on ? <Check size={12} color={t.surface} strokeWidth={3} /> : null}
            </View>
            <Icon size={15} color={color} />
            <Text style={{ color: on ? t.text : t.muted, fontSize: 14 }}>{LOG_LEVEL_LABELS[level]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Log tecnici: del telefono per tutti, del server (con quelli inviati dalle app) per gli amministratori. */
export default function LogScreen() {
  const t = useTheme();
  const bottom = useBottomSpace();
  const isAdmin = useSession().user?.role === 'ADMIN';
  const [where, setWhere] = useState<Where>('phone');
  const source = useLogSource(where);
  const [levels, setLevels] = useState<LogLevel[]>([...LOG_LEVELS]);
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [items, setItems] = useState<LogEntryDTO[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(true);

  useEffect(() => {
    const id = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  const filter = useMemo<LogFilter>(() => ({ levels: levels.length === LOG_LEVELS.length ? undefined : levels, q: q || undefined }), [levels, q]);
  const filtered = !!(filter.levels || filter.q);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError(null);
    source
      .list(filter, { limit: PAGE })
      .then((r) => {
        if (!current) return;
        setItems(r.items);
        setHasMore(r.hasMore);
      })
      .catch((err: unknown) => current && setError(onlineErrorMessage(err)))
      .finally(() => current && setLoading(false));
    return () => {
      current = false;
    };
  }, [source, filter]);

  // Aggiornamento live solo mentre la schermata è aperta.
  const newest = useRef(0);
  newest.current = items[0]?.id ?? 0;
  useFocusEffect(
    useCallback(() => {
      if (!live) return;
      const id = setInterval(() => {
        void source
          .list(filter, { after: newest.current, limit: 500 })
          .then((r) => r.items.length && setItems((prev) => [...r.items, ...prev].slice(0, KEEP)))
          .catch(() => {});
      }, LIVE_EVERY_MS);
      return () => clearInterval(id);
    }, [live, source, filter]),
  );

  const loadOlder = async () => {
    const oldest = items.at(-1)?.id;
    if (!oldest || loading) return;
    setLoading(true);
    try {
      const r = await source.list(filter, { before: oldest, limit: PAGE });
      setItems((prev) => [...prev, ...r.items]);
      setHasMore(r.hasMore);
    } catch (err) {
      setError(onlineErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const exportLogs = async () => {
    setBusy(true);
    try {
      const { text, count } = await source.export(filter);
      if (!count) return void Alert.alert('Nessun log da esportare');
      await Share.share({ message: text.length > SHARE_MAX_CHARS ? text.slice(-SHARE_MAX_CHARS) : text });
    } catch (err) {
      Alert.alert('Esportazione non riuscita', onlineErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const askClear = () =>
    Alert.alert(
      filtered ? 'Cancellare i log filtrati?' : 'Cancellare tutti i log?',
      `${where === 'phone' ? 'Log di questo telefono' : 'Log del server e delle app'}${filtered ? ' che corrispondono ai filtri' : ''}. L’operazione non si può annullare.`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Cancella',
          style: 'destructive',
          onPress: () => {
            setBusy(true);
            source
              .clear(filter)
              .then(() => {
                setItems([]);
                setHasMore(false);
              })
              .catch((err: unknown) => Alert.alert('Cancellazione non riuscita', onlineErrorMessage(err)))
              .finally(() => setBusy(false));
          },
        },
      ],
    );

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <Stack.Screen
        options={{
          title: 'Log',
          headerRight: () => (
            <Pressable accessibilityRole="button" accessibilityLabel={live ? 'Metti in pausa' : 'Aggiornamento live'} onPress={() => setLive((l) => !l)} style={styles.live}>
              {live ? <View style={[styles.dot, { backgroundColor: '#22C55E' }]} /> : null}
              {live ? <Pause size={18} color={t.text} /> : <Play size={18} color={t.text} />}
              <Text style={{ color: t.text, fontSize: 14 }}>{live ? 'Live' : 'In pausa'}</Text>
            </Pressable>
          ),
        }}
      />
      <FlatList
        data={items}
        keyExtractor={(e) => String(e.id)}
        contentContainerStyle={[styles.list, { paddingBottom: bottom }]}
        ListHeaderComponent={
          <View style={styles.header}>
            {isAdmin ? (
              <Chips
                options={[
                  { value: 'phone', label: 'Questo telefono' },
                  { value: 'server', label: 'Server' },
                ]}
                value={where}
                onChange={(v) => setWhere(v as Where)}
              />
            ) : null}
            <SearchField value={search} onChangeText={setSearch} placeholder="Cerca nei log" />
            <LevelToggles value={levels} onChange={setLevels} />
            <View style={styles.actions}>
              <View style={{ flex: 1 }}>
                <Button title={filtered ? 'Esporta filtrati' : 'Esporta'} icon={Share2} variant="secondary" busy={busy} onPress={() => void exportLogs()} />
              </View>
              <View style={{ flex: 1 }}>
                <Button title={filtered ? 'Cancella filtrati' : 'Cancella'} icon={Trash2} variant="secondary" disabled={busy} onPress={askClear} />
              </View>
            </View>
            {error ? <Text style={{ color: t.danger, textAlign: 'center' }}>{error}</Text> : null}
          </View>
        }
        ListEmptyComponent={!loading && !error ? <Message>{levels.length ? 'Nessun log.' : 'Scegli almeno un livello.'}</Message> : undefined}
        ListFooterComponent={loading ? <ActivityIndicator color={t.primary} style={{ margin: spacing.md }} /> : undefined}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (hasMore) void loadOlder();
        }}
        renderItem={({ item }) => <Entry e={item} showUser={where === 'server'} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.md, gap: spacing.xs },
  header: { gap: spacing.sm, marginBottom: spacing.sm },
  levels: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  level: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: radius / 2, paddingHorizontal: 10, paddingVertical: 7 },
  box: { width: 16, height: 16, borderRadius: 4, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: spacing.sm },
  entry: { borderLeftWidth: 3, borderRadius: radius / 3, paddingHorizontal: 10, paddingVertical: 6, gap: 2 },
  entryHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  live: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
