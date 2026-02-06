// AST Factory - Factory functions for creating test AST structures

import type { DocumentAST, Block, TextRun, TextFormatting } from '../../src/types/ast.types';

/**
 * Create default text formatting
 */
export function createFormatting(overrides: Partial<TextFormatting> = {}): TextFormatting {
  return {
    bold: undefined,
    italic: undefined,
    underline: undefined,
    color: undefined,
    font: undefined,
    fontSize: undefined,
    ...overrides
  };
}

/**
 * Create a text run
 */
export function createTextRun(text: string, formatting: Partial<TextFormatting> = {}): TextRun {
  return {
    text,
    formatting: createFormatting(formatting)
  };
}

/**
 * Create a paragraph block
 */
export function createParagraph(
  text: string,
  options: {
    id?: string;
    formatting?: Partial<TextFormatting>;
    runs?: TextRun[];
  } = {}
): Block {
  const formatting = createFormatting(options.formatting);
  return {
    id: options.id || `block-${Math.random().toString(36).substr(2, 9)}`,
    type: 'paragraph',
    text,
    runs: options.runs || [createTextRun(text, options.formatting)],
    formatting
  };
}

/**
 * Create a heading block
 */
export function createHeading(
  text: string,
  level: 1 | 2 | 3 = 1,
  options: {
    id?: string;
    formatting?: Partial<TextFormatting>;
  } = {}
): Block {
  const formatting = createFormatting({ bold: true, ...options.formatting });
  return {
    id: options.id || `block-${Math.random().toString(36).substr(2, 9)}`,
    type: `heading${level}` as 'heading1' | 'heading2' | 'heading3',
    text,
    runs: [createTextRun(text, { bold: true, ...options.formatting })],
    formatting
  };
}

/**
 * Create a page break block
 */
export function createPageBreak(id?: string): Block {
  return {
    id: id || `block-${Math.random().toString(36).substr(2, 9)}`,
    type: 'page-break',
    text: '',
    runs: [],
    formatting: createFormatting()
  };
}

/**
 * Create a document AST
 */
export function createDocument(
  blocks: Block[],
  options: {
    author?: string;
    title?: string;
    created?: Date;
    modified?: Date;
    columnCount?: number;
    columnSpace?: number;
  } = {}
): DocumentAST {
  return {
    metadata: {
      author: options.author,
      title: options.title,
      created: options.created,
      modified: options.modified
    },
    blocks,
    sectionProperties: options.columnCount ? {
      columnCount: options.columnCount,
      columnSpace: options.columnSpace
    } : undefined
  };
}

/**
 * Create a simple document with one paragraph
 */
export function createSimpleDocument(text: string, formatting?: Partial<TextFormatting>): DocumentAST {
  return createDocument([createParagraph(text, { formatting })]);
}

/**
 * Create a multi-paragraph document
 */
export function createMultiParagraphDocument(paragraphs: string[]): DocumentAST {
  return createDocument(
    paragraphs.map((text, index) => createParagraph(text, { id: `block-${index}` }))
  );
}

/**
 * Create a document with mixed block types
 */
export function createMixedDocument(
  items: Array<{ type: 'paragraph' | 'heading'; text: string; level?: 1 | 2 | 3 }>
): DocumentAST {
  const blocks = items.map((item, index) => {
    if (item.type === 'heading') {
      return createHeading(item.text, item.level || 1, { id: `block-${index}` });
    }
    return createParagraph(item.text, { id: `block-${index}` });
  });
  return createDocument(blocks);
}

/**
 * Create an empty document
 */
export function createEmptyDocument(): DocumentAST {
  return createDocument([]);
}

/**
 * Create a document with formatting variations
 */
export function createFormattedDocument(): DocumentAST {
  return createDocument([
    createParagraph('Plain text', { id: 'block-0' }),
    createParagraph('Bold text', { id: 'block-1', formatting: { bold: true } }),
    createParagraph('Italic text', { id: 'block-2', formatting: { italic: true } }),
    createParagraph('Underlined text', { id: 'block-3', formatting: { underline: true } }),
    createParagraph('Colored text', { id: 'block-4', formatting: { color: '#FF0000' } }),
    createParagraph('Custom font', { id: 'block-5', formatting: { font: 'Arial', fontSize: 14 } })
  ]);
}

/**
 * Create a large document for performance testing
 */
export function createLargeDocument(paragraphCount: number): DocumentAST {
  const blocks: Block[] = [];
  for (let i = 0; i < paragraphCount; i++) {
    const text = `Paragraph ${i + 1}: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.`;
    blocks.push(createParagraph(text, { id: `block-${i}` }));
  }
  return createDocument(blocks);
}

/**
 * Create a document with unicode content
 */
export function createUnicodeDocument(): DocumentAST {
  return createDocument([
    createParagraph('English text', { id: 'block-0' }),
    createParagraph('中文文本 (Chinese)', { id: 'block-1' }),
    createParagraph('العربية (Arabic)', { id: 'block-2' }),
    createParagraph('日本語テキスト (Japanese)', { id: 'block-3' }),
    createParagraph('Emoji: 🎉 🚀 📄 ✅ ❌', { id: 'block-4' }),
    createParagraph('Mixed: Hello 世界 🌍', { id: 'block-5' })
  ]);
}
