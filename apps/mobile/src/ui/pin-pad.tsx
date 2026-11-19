import { Delete, type LucideIcon } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, Vibration, View } from 'react-native';
import { PIN_LENGTH } from '@/lib/app-lock';
import { glassEdge, spacing, useTheme } from './theme';

const KEYS: { digit: string; letters: string }[] = [
  { digit: '1', letters: '' },
  { digit: '2', letters: 'ABC' },
  { digit: '3', letters: 'DEF' },
  { digit: '4', letters: 'GHI' },
  { digit: '5', letters: 'JKL' },
  { digit: '6', letters: 'MNO' },
  { digit: '7', letters: 'PQRS' },
  { digit: '8', letters: 'TUV' },
  { digit: '9', letters: 'WXYZ' },
];

const KEY_SIZE = 76;

/** Tasto tondo del tastierino. */
function Key({ onPress, disabled, label, children }: { onPress(): void; disabled?: boolean; label: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.key, glassEdge(t), { backgroundColor: pressed ? t.primarySurface : t.surface, opacity: disabled ? 0.45 : 1 }]}
    >
      {children}
    </Pressable>
  );
}

export interface PinPadProps {
  /** Controlla il PIN completo: `false` → tremolio, vibrazione e si ricomincia. */
  onComplete(pin: string): Promise<boolean>;
  /** Messaggio sotto i puntini (errore, tentativi rimasti…). */
  message?: string | null;
  /** Tastierino fermo fino a questo istante (ms): mostra il conto alla rovescia. */
  waitUntil?: number;
  /** Tasto in basso a sinistra (impronta o volto). */
  biometric?: { icon: LucideIcon; label: string; onPress(): void } | null;
}

/** Puntini del PIN e tastierino numerico disegnati dall'app (nessuna tastiera di sistema). */
export function PinPad({ onComplete, message, waitUntil = 0, biometric }: PinPadProps) {
  const t = useTheme();
  const [pin, setPin] = useState('');
  const [checking, setChecking] = useState(false);
  const [now, setNow] = useState(Date.now());
  const shake = useRef(new Animated.Value(0)).current;

  const waiting = waitUntil > now;
  useEffect(() => {
    if (!waiting) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [waiting]);

  const fail = () => {
    Vibration.vibrate(60);
    Animated.sequence(
      [14, -14, 10, -10, 5, 0].map((toValue) => Animated.timing(shake, { toValue, duration: 50, useNativeDriver: true })),
    ).start(() => setPin(''));
  };

  const press = (digit: string) => {
    if (checking || waiting || pin.length >= PIN_LENGTH) return;
    const next = pin + digit;
    setPin(next);
    if (next.length < PIN_LENGTH) return;
    setChecking(true);
    void onComplete(next)
      .then((ok) => (ok ? setPin('') : fail()))
      .finally(() => setChecking(false));
  };

  const seconds = Math.ceil((waitUntil - now) / 1000);
  const shown = waiting ? `Troppi tentativi: riprova tra ${seconds >= 60 ? `${Math.ceil(seconds / 60)} min` : `${seconds} s`}` : message;
  const BiometricIcon = biometric?.icon;

  return (
    <View style={styles.wrap}>
      <Animated.View style={[styles.dots, { transform: [{ translateX: shake }] }]} accessibilityLabel={`${pin.length} cifre su ${PIN_LENGTH}`}>
        {Array.from({ length: PIN_LENGTH }, (_, i) => {
          const filled = i < pin.length;
          return (
            <View
              key={i}
              style={[styles.dot, { borderColor: filled ? t.primary : t.border, backgroundColor: filled ? t.primary : 'transparent', transform: [{ scale: filled ? 1.1 : 1 }] }]}
            />
          );
        })}
      </Animated.View>
      <View style={styles.message}>
        {checking ? (
          <ActivityIndicator color={t.primary} />
        ) : shown ? (
          <Text style={{ color: waiting || message ? t.danger : t.muted, textAlign: 'center', fontSize: 14 }}>{shown}</Text>
        ) : null}
      </View>

      <View style={styles.grid}>
        {KEYS.map((k) => (
          <Key key={k.digit} label={k.digit} disabled={waiting} onPress={() => press(k.digit)}>
            <Text style={{ color: t.text, fontSize: 30, fontWeight: '300' }}>{k.digit}</Text>
            <Text style={{ color: t.muted, fontSize: 9, fontWeight: '600', letterSpacing: 1.5, height: 12 }}>{k.letters}</Text>
          </Key>
        ))}
        {biometric && BiometricIcon ? (
          <Pressable accessibilityRole="button" accessibilityLabel={biometric.label} onPress={biometric.onPress} style={styles.side}>
            <BiometricIcon size={30} color={t.primary} />
          </Pressable>
        ) : (
          <View style={styles.side} />
        )}
        <Key label="0" disabled={waiting} onPress={() => press('0')}>
          <Text style={{ color: t.text, fontSize: 30, fontWeight: '300' }}>0</Text>
        </Key>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancella"
          disabled={!pin || checking}
          onPress={() => setPin((p) => p.slice(0, -1))}
          onLongPress={() => setPin('')}
          style={[styles.side, { opacity: pin ? 1 : 0.3 }]}
        >
          <Delete size={28} color={t.text} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: spacing.md },
  dots: { flexDirection: 'row', gap: 16, paddingVertical: spacing.sm },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5 },
  message: { minHeight: 22, justifyContent: 'center', paddingHorizontal: spacing.lg },
  grid: { width: KEY_SIZE * 3 + 28 * 2, flexDirection: 'row', flexWrap: 'wrap', columnGap: 28, rowGap: 18 },
  key: { width: KEY_SIZE, height: KEY_SIZE, borderRadius: KEY_SIZE / 2, alignItems: 'center', justifyContent: 'center' },
  side: { width: KEY_SIZE, height: KEY_SIZE, alignItems: 'center', justifyContent: 'center' },
});
