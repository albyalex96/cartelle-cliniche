import { ROLE_LABELS, type UserDTO } from '@alby/shared';
import { router, Stack } from 'expo-router';
import { UserRound, UserRoundPlus } from 'lucide-react-native';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useOnline, useReloadOnFocus } from '@/lib/online';
import { useSession } from '@/lib/session';
import { Badge, Message, OnlineView, Row } from '@/ui/blocks';
import { useBottomSpace } from '@/ui/tab-bar';
import { spacing, useTheme } from '@/ui/theme';

type UsersResponse = { users: UserDTO[] };

function access(u: UserDTO) {
  if (u.role === 'ADMIN') return 'Tutti i pazienti';
  if (!u.access.length) return 'Nessun paziente';
  return u.access.map((a) => a.patientName).join(', ');
}

/** Utenti (solo amministratori, online): chi può accedere all'archivio e quali pazienti vede. */
export default function UsersScreen() {
  const t = useTheme();
  const bottom = useBottomSpace();
  const me = useSession().user;
  const { state, reload } = useOnline<UsersResponse>('/admin/users');
  useReloadOnFocus(reload);
  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <Stack.Screen
        options={{
          title: 'Utenti',
          headerRight: () => (
            <Pressable accessibilityRole="button" accessibilityLabel="Nuovo utente" hitSlop={8} onPress={() => router.push('/account/utenti/modifica')}>
              <UserRoundPlus size={24} color={t.primary} />
            </Pressable>
          ),
        }}
      />
      <OnlineView state={state} reload={reload}>
        {({ users }) => (
          <FlatList
            data={users}
            keyExtractor={(u) => u.id}
            contentContainerStyle={[styles.list, { paddingBottom: bottom }]}
            ListEmptyComponent={<Message>Nessun utente.</Message>}
            renderItem={({ item: u }) => (
              <Row
                icon={UserRound}
                iconTone={u.active ? 'primary' : 'muted'}
                title={u.id === me?.id ? `${u.displayName} (tu)` : u.displayName}
                subtitle={[u.email, ROLE_LABELS[u.role], access(u)].join(' · ')}
                badge={!u.active ? <Badge label="Disattivato" tone="warning" /> : u.mustChangePassword ? <Badge label="Password da cambiare" /> : undefined}
                onPress={() => router.push({ pathname: '/account/utenti/modifica', params: { id: u.id } })}
              />
            )}
          />
        )}
      </OnlineView>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.md, gap: spacing.sm },
});
