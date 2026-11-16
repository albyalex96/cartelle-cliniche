import { useSegments } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassSurface } from './glass';
import type { Icon } from './icons';
import { spacing, useTheme } from './theme';

/** Barra di navigazione flottante in basso, di vetro. */
const BAR_HEIGHT = 64;
const BAR_GAP = 12;

/**
 * Spazio da lasciare in fondo a ogni schermata scorrevole perché la barra flottante non copra l'ultimo
 * elemento: da usare come `paddingBottom` del contenuto (vedi `useBottomSpace`).
 */
export function useBottomSpace(): number {
  const insets = useSafeAreaInsets();
  return insets.bottom + BAR_GAP + BAR_HEIGHT + spacing.md;
}

/** Schermate a tutto schermo (visualizzatori) in cui la barra si nasconde. */
const FULLSCREEN = new Set(['documento', 'immagini', 'foglietto']);

export interface TabIcons {
  [routeName: string]: { icon: Icon; label: string };
}

export function GlassTabBar({ state, navigateToTab, tabs }: BottomTabBarProps & { tabs: TabIcons }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const segments = useSegments() as string[];
  if (segments.some((s) => FULLSCREEN.has(s))) return null;
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: insets.bottom + BAR_GAP }]}>
      <GlassSurface style={styles.bar}>
        <View style={styles.row} accessibilityRole="tablist">
          {state.routes.map((route, i) => {
            const tab = tabs[route.name];
            if (!tab) return null;
            const focused = state.index === i;
            const color = focused ? t.primary : t.muted;
            const TabIcon = tab.icon;
            return (
              <Pressable
                key={route.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: focused }}
                accessibilityLabel={tab.label}
                onPress={() => {
                  if (!focused) navigateToTab(route.key);
                }}
                style={[styles.item, focused && { backgroundColor: t.primarySurface }]}
              >
                <TabIcon size={22} color={color} strokeWidth={focused ? 2.4 : 2} />
                <Text style={[styles.label, { color }]} numberOfLines={1}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </GlassSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: spacing.md, right: spacing.md },
  bar: { height: BAR_HEIGHT, borderRadius: BAR_HEIGHT / 2 },
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, gap: 4 },
  item: { flex: 1, height: BAR_HEIGHT - 12, borderRadius: (BAR_HEIGHT - 12) / 2, alignItems: 'center', justifyContent: 'center', gap: 2 },
  label: { fontSize: 11, fontWeight: '600' },
});
