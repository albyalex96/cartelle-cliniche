import { ROLE_LABELS, ROLES, type AccessEntry, type Role, type UserDTO } from '@alby/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { KeyRound, LogOut, Save, ShieldOff, X } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { ApiError } from '@/lib/api';
import { onlineErrorMessage, useApi, useOnline } from '@/lib/online';
import { useSession } from '@/lib/session';
import { Card, Message, OnlineView, SectionTitle } from '@/ui/blocks';
import { Button, Chips, ErrorBox, Field } from '@/ui/controls';
import { useBottomSpace } from '@/ui/tab-bar';
import { spacing, useTheme } from '@/ui/theme';

type PatientOption = { id: string; firstName: string; lastName: string };
type UsersResponse = { users: UserDTO[]; patients: PatientOption[] };

/** Accesso a un paziente: nessuno, sola lettura o lettura e modifica. */
const ACCESS_OPTIONS = [
  { value: 'none', label: 'Nessuno' },
  { value: 'view', label: 'Lettura' },
  { value: 'edit', label: 'Modifica' },
];

/** Nuovo utente, o modifica di uno esistente (`id`), solo per gli amministratori e online. */
export default function EditUserScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { state, reload } = useOnline<UsersResponse>('/admin/users');
  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <Stack.Screen options={{ title: id ? 'Modifica utente' : 'Nuovo utente' }} />
      <OnlineView state={state} reload={reload}>
        {({ users, patients }) => {
          const user = id ? users.find((u) => u.id === id) : null;
          if (id && !user) return <Message>Utente non trovato.</Message>;
          return <UserForm user={user ?? null} patients={patients} />;
        }}
      </OnlineView>
    </View>
  );
}

function UserForm({ user, patients }: { user: UserDTO | null; patients: PatientOption[] }) {
  const t = useTheme();
  const bottom = useBottomSpace();
  const { send } = useApi();
  const isSelf = useSession().user?.id === user?.id;
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [role, setRole] = useState<Role>(user?.role ?? 'MEDICO');
  const [active, setActive] = useState(user?.active ?? true);
  const [password, setPassword] = useState('');
  const [access, setAccess] = useState<Record<string, AccessEntry>>(() =>
    Object.fromEntries((user?.access ?? []).map((a) => [a.patientId, { patientId: a.patientId, canEdit: a.canEdit }])),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const path = user ? `/admin/users/${encodeURIComponent(user.id)}` : '';

  const setPatientAccess = (patientId: string, value: string) =>
    setAccess((current) => {
      const next = { ...current };
      if (value === 'none') delete next[patientId];
      else next[patientId] = { patientId, canEdit: value === 'edit' };
      return next;
    });

  async function save() {
    setSaving(true);
    setError(null);
    const body = { displayName, email, role, access: Object.values(access) };
    try {
      if (user) await send('PATCH', path, { body: { ...body, ...(isSelf ? {} : { active }) } });
      else await send('POST', '/admin/users', { body: { ...body, password } });
      router.back();
    } catch (err) {
      setErrors(err instanceof ApiError && err.fields ? err.fields : {});
      setError(onlineErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  /** Azioni immediate sull'utente esistente, con conferma. */
  const act = (title: string, message: string, run: () => Promise<string>) =>
    Alert.alert(title, message, [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Conferma',
        style: 'destructive',
        onPress: () =>
          void run()
            .then((done) => Alert.alert('Fatto', done))
            .catch((err: unknown) => Alert.alert('Operazione non riuscita', onlineErrorMessage(err))),
      },
    ]);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottom }]} keyboardShouldPersistTaps="handled">
        <Field label="Nome *" value={displayName} onChangeText={setDisplayName} error={errors.displayName} />
        <Field label="Email *" value={email} onChangeText={setEmail} error={errors.email} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
        {user ? null : (
          <Field
            label="Password temporanea *"
            value={password}
            onChangeText={setPassword}
            error={errors.password}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
        )}
        <SectionTitle>Ruolo</SectionTitle>
        <Chips options={ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))} value={role} onChange={(r) => setRole(r as Role)} />
        {user && !isSelf ? (
          <View style={styles.switchRow}>
            <Text style={[styles.label, { color: t.text }]}>Account attivo</Text>
            <Switch accessibilityLabel="Account attivo" value={active} onValueChange={setActive} />
          </View>
        ) : null}

        <SectionTitle>Pazienti visibili</SectionTitle>
        {role === 'ADMIN' ? (
          <Message>Gli amministratori vedono e modificano tutti i pazienti.</Message>
        ) : patients.length ? (
          patients.map((p) => (
            <Card key={p.id} title={`${p.lastName} ${p.firstName}`}>
              <Chips
                options={ACCESS_OPTIONS}
                value={access[p.id] ? (access[p.id]!.canEdit ? 'edit' : 'view') : 'none'}
                onChange={(v) => setPatientAccess(p.id, v)}
              />
            </Card>
          ))
        ) : (
          <Message>Nessun paziente nell’archivio.</Message>
        )}

        <ErrorBox message={error} />
        <View style={styles.pair}>
          <View style={styles.flex}>
            <Button title="Annulla" icon={X} variant="secondary" disabled={saving} onPress={() => router.back()} />
          </View>
          <View style={styles.flex}>
            <Button title="Salva" icon={Save} busy={saving} onPress={() => void save()} />
          </View>
        </View>

        {user && !isSelf ? (
          <Card title="Sicurezza" subtitle="Azioni immediate: non serve premere Salva.">
            <Field label="Nuova password temporanea" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} />
            <Button
              title="Reimposta la password"
              icon={KeyRound}
              variant="secondary"
              disabled={!password}
              onPress={() =>
                act('Reimpostare la password?', `${user.displayName} dovrà cambiarla al prossimo accesso.`, async () => {
                  await send('POST', `${path}/password`, { body: { newPassword: password } });
                  setPassword('');
                  return 'Password reimpostata.';
                })
              }
            />
            <Button
              title="Togli app di autenticazione e passkey"
              icon={ShieldOff}
              variant="secondary"
              onPress={() =>
                act('Togliere i secondi fattori?', `${user.displayName} potrà accedere solo con la password finché non li configura di nuovo.`, async () => {
                  await send('DELETE', `${path}/second-factors`);
                  return 'Secondi fattori rimossi.';
                })
              }
            />
            <Button
              title="Chiudi tutte le sessioni"
              icon={LogOut}
              variant="secondary"
              onPress={() =>
                act('Chiudere le sessioni?', `${user.displayName} dovrà accedere di nuovo, sul sito e nell’app.`, async () => {
                  const res = await send<{ closed: number }>('DELETE', `${path}/sessions`);
                  return res.closed === 1 ? '1 sessione chiusa.' : `${res.closed} sessioni chiuse.`;
                })
              }
            />
          </Card>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.md },
  label: { fontSize: 15, fontWeight: '600', flex: 1 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pair: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
