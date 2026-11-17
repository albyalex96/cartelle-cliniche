import { EllipsisVertical } from 'lucide-react-native';
import { useRef, useState, type ComponentRef } from 'react';
import { Dimensions, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Icon } from './icons';
import { glassEdge, radius, spacing, useTheme } from './theme';

export interface MenuItem {
  label: string;
  icon?: Icon;
  onPress(): void;
}

/** Bottone "⋮" che apre, sotto di sé, un elenco di azioni. */
export function Menu({ items, label = 'Altre azioni' }: { items: MenuItem[]; label?: string }) {
  const t = useTheme();
  const anchor = useRef<ComponentRef<typeof View>>(null);
  const [at, setAt] = useState<{ top: number; right: number } | null>(null);

  const open = () =>
    anchor.current?.measureInWindow((x: number, y: number, width: number, height: number) => {
      // Il menu si apre allineato al bordo destro del bottone, subito sotto.
      setAt({ top: y + height, right: Math.max(spacing.sm, Dimensions.get('window').width - (x + width)) });
    });

  return (
    <>
      <View ref={anchor} collapsable={false}>
        <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={open} hitSlop={8} style={styles.trigger}>
          <EllipsisVertical size={22} color={t.muted} />
        </Pressable>
      </View>
      <Modal visible={!!at} transparent statusBarTranslucent animationType="fade" onRequestClose={() => setAt(null)}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setAt(null)} accessibilityLabel="Chiudi il menu" />
        {at ? (
          <View style={[styles.menu, glassEdge(t), { top: at.top, right: at.right, backgroundColor: t.surface, shadowColor: t.shadow }]}>
            {items.map((item) => (
              <Pressable
                key={item.label}
                accessibilityRole="menuitem"
                onPress={() => {
                  setAt(null);
                  item.onPress();
                }}
                style={({ pressed }) => [styles.item, pressed && { backgroundColor: t.background }]}
              >
                {item.icon ? <item.icon size={20} color={t.primary} /> : null}
                <Text style={{ color: t.text, fontSize: 16 }}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: { padding: spacing.xs },
  menu: { position: 'absolute', minWidth: 200, borderWidth: 1, borderRadius: radius, paddingVertical: spacing.xs, elevation: 8 },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2 },
});
