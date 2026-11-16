import { BlurTargetView, BlurView } from 'expo-blur';
import { useFocusEffect } from 'expo-router';
import { createContext, use, useCallback, useRef, useState, type ComponentRef, type ReactNode, type RefObject } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { floating, glassEdge, useTheme } from './theme';

/**
 * Effetto vetro sfocato (stile Apple) per gli elementi che galleggiano sopra i contenuti, come la barra in basso.
 *
 * Su Android la sfocatura vera (expo-blur, `dimezisBlurViewSdk31Plus`: Android 12+, sotto si vede solo il
 * riempimento traslucido) deve sapere quale vista sfocare: ogni scheda avvolge le sue schermate in
 * `<GlassTarget>`, che quando la scheda è attiva si registra qui. La barra non sta dentro quella vista
 * (una vista non può sfocare se stessa).
 */

type TargetRef = RefObject<ComponentRef<typeof View> | null>;
const GlassContext = createContext<{ target: TargetRef | null; setTarget(ref: TargetRef): void } | null>(null);

export function GlassProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<TargetRef | null>(null);
  return <GlassContext value={{ target, setTarget }}>{children}</GlassContext>;
}

/** Contenuto che il vetro sfoca: da usare nel layout di ogni scheda, attorno al suo `<Stack />`. */
export function GlassTarget({ children }: { children: ReactNode }) {
  const ref = useRef<ComponentRef<typeof View> | null>(null);
  const glass = use(GlassContext);
  useFocusEffect(
    useCallback(() => {
      glass?.setTarget(ref);
    }, [glass]),
  );
  return (
    <BlurTargetView ref={ref} style={styles.flex}>
      {children}
    </BlurTargetView>
  );
}

/** Superficie di vetro: sfocatura di ciò che sta dietro, velo traslucido, bordo con riflesso e ombra. */
export function GlassSurface({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const glass = use(GlassContext);
  return (
    <View style={[floating(t), style]}>
      <View style={[StyleSheet.absoluteFill, styles.clip, glassEdge(t), { borderRadius: StyleSheet.flatten(style)?.borderRadius }]}>
        {glass?.target ? (
          <BlurView
            blurTarget={glass.target}
            blurMethod="dimezisBlurViewSdk31Plus"
            intensity={60}
            tint={t.dark ? 'dark' : 'light'}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: glass?.target ? t.glassTint : t.glassFill }]} />
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  clip: { overflow: 'hidden' },
});
