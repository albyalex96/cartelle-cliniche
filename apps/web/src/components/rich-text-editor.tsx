'use client';

import { parseRichText, serializeRichText, type RichBlock, type RichInline, type RichMark } from '@alby/shared';
import { EditorContent, useEditor, useEditorState, type JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold, Heading, Italic, List, ListOrdered, Redo2, RemoveFormatting, Strikethrough, Underline, Undo2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { RICH_TEXT_CLASS } from '@/components/rich-text';
import { ToolbarButton, ToolbarDivider } from '@/components/toolbar-button';
import { cn } from '@/lib/utils';

// ── Dal formato salvato (vedi `parseRichText`) ai documenti di Tiptap, e ritorno ──────────────────

const inlineToJson = (content: RichInline[]): JSONContent[] =>
  content.map((n) => (n.type === 'break' ? { type: 'hardBreak' } : { type: 'text', text: n.text, ...(n.marks.length && { marks: n.marks.map((type) => ({ type })) }) }));

function toJson(text: string): JSONContent {
  const paragraph = (content: RichInline[]): JSONContent => ({ type: 'paragraph', ...(content.length && { content: inlineToJson(content) }) });
  return {
    type: 'doc',
    content: parseRichText(text).map((b) =>
      'items' in b
        ? { type: b.type, content: b.items.map((item) => ({ type: 'listItem', content: [paragraph(item)] })) }
        : b.type === 'heading'
          ? { type: 'heading', attrs: { level: 3 }, content: inlineToJson(b.content) }
          : paragraph(b.content),
    ),
  };
}

const MARKS = new Set<string>(['bold', 'italic', 'underline', 'strike']);

function inlineFromJson(nodes: JSONContent[] = []): RichInline[] {
  return nodes.flatMap((n): RichInline[] => {
    if (n.type === 'hardBreak') return [{ type: 'break' }];
    if (n.type !== 'text' || !n.text) return [];
    return [{ type: 'text', text: n.text, marks: (n.marks ?? []).map((m) => m.type).filter((t): t is RichMark => MARKS.has(t)) }];
  });
}

function fromJson(doc: JSONContent): string {
  const blocks: RichBlock[] = [];
  // Le voci di un elenco sono di una riga (o più, unite da "a capo"); gli elenchi annidati si appiattiscono.
  const items = (list: JSONContent): RichInline[][] =>
    (list.content ?? []).flatMap((li) => {
      const own: RichInline[] = [];
      const nested: RichInline[][] = [];
      for (const child of li.content ?? []) {
        if (child.type === 'bulletList' || child.type === 'orderedList') nested.push(...items(child));
        else {
          if (own.length) own.push({ type: 'break' });
          own.push(...inlineFromJson(child.content));
        }
      }
      return [own, ...nested];
    });
  for (const node of doc.content ?? []) {
    if (node.type === 'bulletList' || node.type === 'orderedList') blocks.push({ type: node.type, items: items(node) });
    else blocks.push({ type: node.type === 'heading' ? 'heading' : 'paragraph', content: inlineFromJson(node.content) });
  }
  return serializeRichText(blocks);
}

// ── Editor ─────────────────────────────────────────────────────────────────────────────────────

const extensions = [
  StarterKit.configure({
    heading: { levels: [3] },
    blockquote: false,
    code: false,
    codeBlock: false,
    horizontalRule: false,
    link: false,
  }),
];

/**
 * Campo di testo con formattazione (grassetto, corsivo, sottolineato, barrato, titoletto, elenchi),
 * con la sua barra dei bottoni. Il valore è il testo nel formato di `parseRichText`.
 */
export function RichTextEditor({
  id,
  label,
  value,
  onChange,
  invalid,
  disabled,
  rows = 6,
  className,
}: {
  id?: string;
  /** Nome del campo per i lettori di schermo. */
  label: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  disabled?: boolean;
  /** Altezza minima, in righe di testo. */
  rows?: number;
  className?: string;
}) {
  // Ultimo valore uscito dall'editor: se `value` cambia da fuori (es. testo letto con l'OCR), si ricarica.
  const last = useRef(value);
  const change = useRef(onChange);
  useEffect(() => {
    change.current = onChange;
  });

  const editor = useEditor({
    extensions,
    content: toJson(value),
    // Nessun rendering sul server: l'editor nasce nel browser.
    immediatelyRender: false,
    editable: !disabled,
    editorProps: {
      attributes: {
        ...(id && { id }),
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': label,
        class: cn(RICH_TEXT_CLASS, 'px-2.5 py-2 text-base outline-none md:text-sm'),
      },
    },
    onUpdate: ({ editor }) => {
      const next = fromJson(editor.getJSON());
      last.current = next;
      change.current(next);
    },
  });

  useEffect(() => {
    if (!editor || value === last.current) return;
    last.current = value;
    editor.commands.setContent(toJson(value), { emitUpdate: false });
  }, [editor, value]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  const state = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e && {
        bold: e.isActive('bold'),
        italic: e.isActive('italic'),
        underline: e.isActive('underline'),
        strike: e.isActive('strike'),
        heading: e.isActive('heading'),
        bulletList: e.isActive('bulletList'),
        orderedList: e.isActive('orderedList'),
        canUndo: e.can().undo(),
        canRedo: e.can().redo(),
      },
  });

  const off = !editor || disabled;
  const run = (command: (chain: ReturnType<NonNullable<typeof editor>['chain']>) => { run: () => boolean }) => {
    if (editor) command(editor.chain().focus()).run();
  };

  return (
    <div
      aria-invalid={invalid || undefined}
      className={cn(
        'w-full rounded-lg border border-input bg-transparent transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      <div
        role="toolbar"
        aria-label={`Formattazione: ${label}`}
        className="flex flex-wrap items-center gap-0.5 border-b p-1"
        // I bottoni non tolgono il cursore dal testo.
        onMouseDown={(e) => e.preventDefault()}
      >
        <ToolbarButton label="Grassetto (Ctrl+B)" icon={Bold} pressed={!!state?.bold} disabled={off} onClick={() => run((c) => c.toggleBold())} />
        <ToolbarButton label="Corsivo (Ctrl+I)" icon={Italic} pressed={!!state?.italic} disabled={off} onClick={() => run((c) => c.toggleItalic())} />
        <ToolbarButton label="Sottolineato (Ctrl+U)" icon={Underline} pressed={!!state?.underline} disabled={off} onClick={() => run((c) => c.toggleUnderline())} />
        <ToolbarButton label="Barrato" icon={Strikethrough} pressed={!!state?.strike} disabled={off} onClick={() => run((c) => c.toggleStrike())} />
        <ToolbarDivider />
        <ToolbarButton label="Titoletto" icon={Heading} pressed={!!state?.heading} disabled={off} onClick={() => run((c) => c.toggleHeading({ level: 3 }))} />
        <ToolbarButton label="Elenco puntato" icon={List} pressed={!!state?.bulletList} disabled={off} onClick={() => run((c) => c.toggleBulletList())} />
        <ToolbarButton label="Elenco numerato" icon={ListOrdered} pressed={!!state?.orderedList} disabled={off} onClick={() => run((c) => c.toggleOrderedList())} />
        <ToolbarButton label="Togli la formattazione" icon={RemoveFormatting} disabled={off} onClick={() => run((c) => c.unsetAllMarks().clearNodes())} />
        <ToolbarDivider />
        <ToolbarButton label="Annulla (Ctrl+Z)" icon={Undo2} disabled={off || !state?.canUndo} onClick={() => run((c) => c.undo())} />
        <ToolbarButton label="Ripeti (Ctrl+Y)" icon={Redo2} disabled={off || !state?.canRedo} onClick={() => run((c) => c.redo())} />
      </div>
      {/* Altezza minima anche prima che l'editor sia pronto (nessun salto della pagina). */}
      <EditorContent editor={editor} className="grid" style={{ minHeight: `calc(${rows} * 1.625em + 1rem)` }} />
    </div>
  );
}
