import { parseRichText, type RichInline } from '@alby/shared';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Aspetto del testo formattato, uguale nella pagina del referto e nell'editor (file neutro:
 * va bene sia nei Server Component sia nei Client Component).
 */
export const RICH_TEXT_CLASS =
  'text-sm leading-relaxed [&>*+*]:mt-3 [&_h3]:text-base [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5 [&_li+li]:mt-1 [&_li>p]:m-0';

function Inline({ content }: { content: RichInline[] }) {
  return content.map((node, i) => {
    if (node.type === 'break') return <br key={i} />;
    let el: ReactNode = node.text;
    if (node.marks.includes('strike')) el = <s>{el}</s>;
    if (node.marks.includes('underline')) el = <u>{el}</u>;
    if (node.marks.includes('italic')) el = <em>{el}</em>;
    if (node.marks.includes('bold')) el = <strong>{el}</strong>;
    return <span key={i}>{el}</span>;
  });
}

/**
 * Testo del referto con la sua formattazione (grassetto, corsivo, elenchi…). Nessun HTML dal
 * database: gli elementi si creano qui, dal formato di `parseRichText`.
 */
export function RichText({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn(RICH_TEXT_CLASS, className)}>
      {parseRichText(text).map((block, i) => {
        if (block.type === 'heading') return <h3 key={i}><Inline content={block.content} /></h3>;
        if (block.type === 'paragraph') return <p key={i}><Inline content={block.content} /></p>;
        const List = block.type === 'bulletList' ? 'ul' : 'ol';
        return (
          <List key={i}>
            {block.items.map((item, k) => (
              <li key={k}>
                <Inline content={item} />
              </li>
            ))}
          </List>
        );
      })}
    </div>
  );
}
