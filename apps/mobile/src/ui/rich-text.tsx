import { parseRichText, type RichInline } from '@alby/shared';
import { Fragment } from 'react';
import { StyleSheet, Text, View, type TextStyle } from 'react-native';
import { spacing, useTheme } from './theme';

const MARK_STYLES: Record<string, TextStyle> = {
  bold: { fontWeight: '700' },
  italic: { fontStyle: 'italic' },
  underline: { textDecorationLine: 'underline' },
  strike: { textDecorationLine: 'line-through' },
};

function Inline({ content }: { content: RichInline[] }) {
  return (
    <>
      {content.map((part, i) =>
        part.type === 'break' ? (
          <Fragment key={i}>{'\n'}</Fragment>
        ) : (
          <Text key={i} style={part.marks.map((m) => MARK_STYLES[m])}>
            {part.text}
          </Text>
        ),
      )}
    </>
  );
}

/** Testo formattato dei referti (stesso formato della webapp: `parseRichText` di @alby/shared). */
export function RichText({ text }: { text: string }) {
  const t = useTheme();
  const base = { color: t.text, fontSize: 16, lineHeight: 23 };
  return (
    <View style={styles.blocks}>
      {parseRichText(text).map((block, i) => {
        if (block.type === 'heading') {
          return (
            <Text key={i} selectable style={[base, styles.heading]}>
              <Inline content={block.content} />
            </Text>
          );
        }
        if (block.type === 'paragraph') {
          return (
            <Text key={i} selectable style={base}>
              <Inline content={block.content} />
            </Text>
          );
        }
        return (
          <View key={i} style={styles.list}>
            {block.items.map((item, j) => (
              <View key={j} style={styles.item}>
                <Text style={base}>{block.type === 'orderedList' ? `${j + 1}.` : '•'}</Text>
                <Text selectable style={[base, styles.itemText]}>
                  <Inline content={item} />
                </Text>
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  blocks: { gap: spacing.sm },
  heading: { fontSize: 18, fontWeight: '700' },
  list: { gap: spacing.xs },
  item: { flexDirection: 'row', gap: spacing.sm },
  itemText: { flex: 1 },
});
