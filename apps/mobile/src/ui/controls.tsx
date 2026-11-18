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
import { formatDate } from '@/lib/format';
import { parseDateInput } from '@/lib/new-report';
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
  /** Elemento accanto al campo, a destra (es. il bottone per leggerlo da una foto). */
  accessory?: ReactNode;
}

export function Field({ label, error, style, accessory, ...input }: FieldProps) {
  const t = useTheme();
  const field = (
    <TextInput
      placeholderTextColor={t.muted}
      accessibilityLabel={label}
      style={[styles.input, glassEdge(t), { color: t.text, backgroundColor: t.surface }, error ? { borderColor: t.danger } : null, accessory ? styles.flex : null, style]}
      {...input}
    />
  );
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: t.text }]}>{label}</Text>
      {accessory ? (
        <View style={styles.withAccessory}>
          {field}
          {accessory}
        </View>
      ) : (
        field
      )}
      {error ? <Text style={{ color: t.danger, fontSize: 13 }}>{error}</Text> : null}
    </View>
  );
}

/** Data scritta come GG/MM/AAAA; nel form resta AAAA-MM-GG quando è valida, altrimenti il testo così com'è. */
export function DateField({
  label,
  value,
  onChange,
  error,
  accessory,
}: {
  label: string;
  value: string;
  onChange(value: string): void;
  error?: string;
  accessory?: ReactNode;
}) {
  const shown = /^\d{4}-\d{2}-\d{2}$/.test(value) ? formatDate(value) : value;
  return (
    <Field
      label={label}
      value={shown}
      placeholder="GG/MM/AAAA"
      keyboardType="numbers-and-punctuation"
      onChangeText={(text) => onChange(parseDateInput(text) ?? text)}
      error={error}
      accessory={accessory}
    />
  );
}

/** Scelta tra poche voci, come pastiglie affiancate. */
export function Chips({
  options,
  value,
  onChange,
  clearable,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange(value: string): void;
  /** Toccando la voce scelta la si toglie (campi facoltativi). */
  clearable?: boolean;
}) {
  const t = useTheme();
  return (
    <View style={styles.chips}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(selected && clearable ? '' : o.value)}
            style={[styles.chip, { backgroundColor: selected ? t.primary : t.surface, borderColor: selected ? t.primary : t.border }]}
          >
            <Text style={{ color: selected ? t.onPrimary : t.text, fontSize: 15 }}>{o.label}</Text>
          </Pressable>
        );
      })}
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
  withAccessory: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  label: { fontSize: 15, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: radius, paddingHorizontal: spacing.md, minHeight: 52, fontSize: 17 },
  button: { minHeight: 52, borderRadius: radius, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  buttonText: { fontSize: 17, fontWeight: '600' },
  buttonContent: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius, paddingHorizontal: spacing.md, minHeight: 50 },
  searchInput: { flex: 1, fontSize: 17, paddingVertical: 10 },
});
