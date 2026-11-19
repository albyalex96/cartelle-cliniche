import { ShieldCheck, X, type LucideIcon } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PinPad } from './pin-pad';
import { spacing, useTheme } from './theme';

/**
 * Cornice delle schermate di blocco (sblocco, scelta e cambio del PIN): sfondo con due cerchi sfumati del
 * colore dell'app, simbolo in alto, titolo e sottotitolo, contenuto al centro e azioni in fondo.
 */
export function LockScreen({
  icon: Icon = ShieldCheck,
  title,
  subtitle,
  children,
  footer,
  onClose,
}: {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Croce in alto a destra (schermate aperte dalle impostazioni). */
  onClose?: () => void;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, { backgroundColor: t.background, paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.md }]}>
      <View pointerEvents="none" style={[styles.glow, styles.glowTop, { backgroundColor: t.primarySurface }]} />
      <View pointerEvents="none" style={[styles.glow, styles.glowBottom, { backgroundColor: t.primarySurface }]} />
      {onClose ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Chiudi" onPress={onClose} style={[styles.close, { top: insets.top + spacing.sm }]}>
          <X size={24} color={t.muted} />
        </Pressable>
      ) : null}

      <View style={styles.header}>
        <View style={[styles.badge, { backgroundColor: t.primary, shadowColor: t.primary }]}>
          <Icon size={30} color={t.onPrimary} strokeWidth={2.2} />
        </View>
        <Text style={[styles.title, { color: t.text }]}>{title}</Text>
        {subtitle ? <Text style={[styles.subtitle, { color: t.muted }]}>{subtitle}</Text> : null}
      </View>

      <View style={styles.body}>{children}</View>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  );
}

/** Pulsante testuale in fondo alle schermate di blocco ("Esci dall'account", "Continua senza blocco"…). */
export function LockLink({ title, onPress, tone = 'muted' }: { title: string; onPress(): void; tone?: 'muted' | 'danger' }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={12}>
      <Text style={{ color: tone === 'danger' ? t.danger : t.muted, fontSize: 15, fontWeight: '600' }}>{title}</Text>
    </Pressable>
  );
}

/** Scelta di un nuovo PIN: si scrive, poi si ripete per conferma. */
export function PinSetup({ onDone, onStepChange }: { onDone(pin: string): Promise<void>; onStepChange?(confirming: boolean): void }) {
  const [first, setFirst] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  return (
    <PinPad
      key={first ? 'confirm' : 'choose'}
      message={message}
      onComplete={async (pin) => {
        if (!first) {
          if (/^(\d)\1+$/.test(pin) || '0123456789'.includes(pin) || '9876543210'.includes(pin)) {
            setMessage('PIN troppo semplice: evita cifre uguali o in sequenza');
            return false;
          }
          setMessage(null);
          setFirst(pin);
          onStepChange?.(true);
          return true;
        }
        if (pin !== first) {
          setFirst(null);
          onStepChange?.(false);
          setMessage('I due PIN non coincidono: ricomincia');
          return false;
        }
        await onDone(pin);
        return true;
      }}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, overflow: 'hidden' },
  glow: { position: 'absolute', width: 420, height: 420, borderRadius: 210, opacity: 0.7 },
  glowTop: { top: -220, right: -160 },
  glowBottom: { bottom: -260, left: -200 },
  close: { position: 'absolute', right: spacing.md, zIndex: 1, padding: spacing.sm },
  header: { alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  badge: {
    width: 64,
    height: 64,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  title: { fontSize: 24, fontWeight: '700', textAlign: 'center' },
  subtitle: { fontSize: 15, textAlign: 'center', lineHeight: 21 },
  body: { flex: 1, justifyContent: 'center' },
  footer: { alignItems: 'center', gap: spacing.md },
});
