/** Testo formattato del referto (sottoinsieme di Markdown). Non usa il database. */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { escapeRichText, parseRichText, richTextToPlain, serializeRichText, type RichBlock } from '@alby/shared';

const text = (t: string, ...marks: ('bold' | 'italic' | 'underline' | 'strike')[]) => ({ type: 'text' as const, text: t, marks });

describe('testo formattato', () => {
  test('il testo semplice già salvato resta com’è', () => {
    const plain = 'Menisco mediale regolare.\nLegamenti integri.\n\nConclusioni: nulla da segnalare.';
    assert.deepEqual(parseRichText(plain), [
      { type: 'paragraph', content: [text('Menisco mediale regolare.'), { type: 'break' }, text('Legamenti integri.')] },
      { type: 'paragraph', content: [text('Conclusioni: nulla da segnalare.')] },
    ]);
    assert.equal(richTextToPlain(plain), plain);
  });

  test('segni senza compagno o tra spazi restano testo', () => {
    assert.deepEqual(parseRichText('2 * 3 = 6, valore *'), [{ type: 'paragraph', content: [text('2 * 3 = 6, valore *')] }]);
    assert.deepEqual(parseRichText('a ** b'), [{ type: 'paragraph', content: [text('a ** b')] }]);
  });

  test('formattazione, titoletti ed elenchi', () => {
    assert.deepEqual(parseRichText('### Esito\n**Grassetto** e *corsivo*, ++sotto++ ~~via~~ ***entrambi***\n\n- uno\n- **due**\n  seguito\n\n1. primo\n2) secondo'), [
      { type: 'heading', content: [text('Esito')] },
      {
        type: 'paragraph',
        content: [
          text('Grassetto', 'bold'),
          text(' e '),
          text('corsivo', 'italic'),
          text(', '),
          text('sotto', 'underline'),
          text(' '),
          text('via', 'strike'),
          text(' '),
          text('entrambi', 'bold', 'italic'),
        ],
      },
      { type: 'bulletList', items: [[text('uno')], [text('due', 'bold'), { type: 'break' }, text('seguito')]] },
      { type: 'orderedList', items: [[text('primo')], [text('secondo')]] },
    ]);
  });

  test('scrittura e rilettura danno lo stesso testo', () => {
    const blocks: RichBlock[] = [
      { type: 'heading', content: [text('Conclusioni')] },
      { type: 'paragraph', content: [text('Valore '), text('alto ', 'bold'), text('da *rivedere*', 'italic', 'underline'), { type: 'break' }, text('- non è un elenco')] },
      { type: 'bulletList', items: [[text('PSA ++ 4'), { type: 'break' }, text('1. riga')], [text('fine', 'strike')]] },
      { type: 'orderedList', items: [[text('# primo')]] },
    ];
    const md = serializeRichText(blocks);
    // Gli spazi ai bordi di un tratto formattato restano fuori dai segni.
    const expected = structuredClone(blocks);
    (expected[1] as { content: unknown[] }).content.splice(1, 1, text('alto', 'bold'), text(' '));
    assert.deepEqual(parseRichText(md), expected);
  });

  test('il testo semplice reso letterale non diventa formattazione', () => {
    const ocr = '- 3 * 4 **non grassetto**\n# 12. riga \\ fine';
    const md = escapeRichText(ocr);
    assert.equal(richTextToPlain(md), ocr);
    assert.equal(parseRichText(md).length, 1);
  });
});
