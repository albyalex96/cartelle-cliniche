import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Search } from 'lucide-react-native';
import type { Icon } from './icons';
import { glassEdge, radius, spacing, useTheme } from './theme';

/** Schermata a scorrimento con margini, sicura rispetto a tacche e tastiera. */
export function Screen({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: t.background }]}>
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Title({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text style={[styles.title, { color: t.text }]}>{children}</Text>;
}

export function Paragraph({ children, muted }: { children: ReactNode; muted?: boolean }) {
  const t = useTheme();
  return <Text style={[styles.paragraph, { color: muted ? t.muted : t.text }]}>{children}</Text>;
}

/** Messaggio d'errore ben visibile; nessun output se `message` è vuoto. */
export function ErrorBox({ message }: { message: string | null }) {
  const t = useTheme();
  if (!message) return null;
  return (
    <View accessibilityRole="alert" style={[styles.errorBox, { backgroundColor: t.dangerSurface }]}>
      <Text style={{ color: t.danger, fontSize: 15 }}>{message}</Text>
    </View>
  );
}

interface FieldProps extends TextInputProps {
  label: string;
  error?: string;
}

export function Field({ label, error, style, ...input }: FieldProps) {
  const t = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: t.text }]}>{label}</Text>
      <TextInput
        placeholderTextColor={t.muted}
        accessibilityLabel={label}
        style={[styles.input, glassEdge(t), { color: t.text, backgroundColor: t.surface }, error ? { borderColor: t.danger } : null, style]}
        {...input}
      />
      {error ? <Text style={{ color: t.danger, fontSize: 13 }}>{error}</Text> : null}
    </View>
  );
}

/** Campo di ricerca con la lente, per gli elenchi consultati online. */
export function SearchField({ value, onChangeText, placeholder }: { value: string; onChangeText(text: string): void; placeholder: string }) {
  const t = useTheme();
  return (
    <View style={[styles.search, glassEdge(t), { backgroundColor: t.surface }]}>
      <Search size={20} color={t.muted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={t.muted}
        accessibilityLabel={placeholder}
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="while-editing"
        style={[styles.searchInput, { color: t.text }]}
      />
    </View>
  );
}

interface ButtonProps {
  title: string;
  icon?: Icon;
  onPress(): void;
  busy?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
}

export function Button({ title, icon: ButtonIcon, onPress, busy, disabled, variant = 'primary' }: ButtonProps) {
  const t = useTheme();
  const primary = variant === 'primary';
  const inactive = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!busy }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary ? { backgroundColor: t.primary } : { ...glassEdge(t), backgroundColor: t.glassFill },
        (pressed || inactive) && { opacity: 0.6 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={primary ? t.onPrimary : t.text} />
      ) : (
        <View style={styles.buttonContent}>
          {ButtonIcon ? <ButtonIcon size={20} color={primary ? t.onPrimary : t.primary} /> : null}
          <Text style={[styles.buttonText, { color: primary ? t.onPrimary : t.text }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { padding: spacing.lg, gap: spacing.md, flexGrow: 1, justifyContent: 'center' },
  title: { fontSize: 28, fontWeight: '700' },
  paragraph: { fontSize: 16, lineHeight: 22 },
  errorBox: { padding: spacing.md, borderRadius: radius },
  field: { gap: spacing.xs },
  label: { fontSize: 15, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: radius, paddingHorizontal: spacing.md, minHeight: 52, fontSize: 17 },
  button: { minHeight: 52, borderRadius: radius, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  buttonText: { fontSize: 17, fontWeight: '600' },
  buttonContent: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius, paddingHorizontal: spacing.md, minHeight: 50 },
  searchInput: { flex: 1, fontSize: 17, paddingVertical: 10 },
});
