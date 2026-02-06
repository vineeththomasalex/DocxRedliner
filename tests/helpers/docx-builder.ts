// DOCX Builder - Helper functions for creating test DOCX files

import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  Packer,
  AlignmentType,
  PageBreak
} from 'docx';
import { writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';

export interface DocxParagraphOptions {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  font?: string;
  size?: number;
  heading?: 'Heading1' | 'Heading2' | 'Heading3';
  alignment?: 'left' | 'center' | 'right' | 'justify';
}

export interface DocxDocumentOptions {
  title?: string;
  author?: string;
  paragraphs: DocxParagraphOptions[];
}

/**
 * Create a text run with formatting
 */
export function createTextRun(options: Omit<DocxParagraphOptions, 'heading' | 'alignment'>): TextRun {
  return new TextRun({
    text: options.text,
    bold: options.bold,
    italics: options.italic,
    underline: options.underline ? {} : undefined,
    color: options.color,
    font: options.font,
    size: options.size ? options.size * 2 : undefined // Size in half-points
  });
}

/**
 * Create a paragraph with formatting
 */
export function createParagraph(options: DocxParagraphOptions): Paragraph {
  const headingLevel = options.heading ? HeadingLevel[options.heading.toUpperCase() as keyof typeof HeadingLevel] : undefined;

  const alignment = options.alignment ? {
    left: AlignmentType.LEFT,
    center: AlignmentType.CENTER,
    right: AlignmentType.RIGHT,
    justify: AlignmentType.JUSTIFIED
  }[options.alignment] : undefined;

  return new Paragraph({
    heading: headingLevel,
    alignment,
    children: [createTextRun(options)]
  });
}

/**
 * Create a page break paragraph
 */
export function createPageBreakParagraph(): Paragraph {
  return new Paragraph({
    children: [new PageBreak()]
  });
}

/**
 * Create a DOCX document
 */
export function createDocxDocument(options: DocxDocumentOptions): Document {
  return new Document({
    title: options.title,
    creator: options.author,
    sections: [{
      properties: {},
      children: options.paragraphs.map(p => createParagraph(p))
    }]
  });
}

/**
 * Save a DOCX document to a file
 */
export async function saveDocx(doc: Document, filePath: string): Promise<void> {
  // Ensure directory exists
  await mkdir(dirname(filePath), { recursive: true });

  const buffer = await Packer.toBuffer(doc);
  await writeFile(filePath, buffer);
}

/**
 * Create a simple test document
 */
export function createSimpleTestDoc(text: string): Document {
  return createDocxDocument({
    paragraphs: [{ text }]
  });
}

/**
 * Create a document pair for testing insertions
 */
export function createInsertionPair(): { original: Document; modified: Document } {
  return {
    original: createDocxDocument({
      paragraphs: [{ text: 'Hello world' }]
    }),
    modified: createDocxDocument({
      paragraphs: [{ text: 'Hello beautiful world' }]
    })
  };
}

/**
 * Create a document pair for testing deletions
 */
export function createDeletionPair(): { original: Document; modified: Document } {
  return {
    original: createDocxDocument({
      paragraphs: [{ text: 'Hello beautiful world' }]
    }),
    modified: createDocxDocument({
      paragraphs: [{ text: 'Hello world' }]
    })
  };
}

/**
 * Create a document pair for testing paragraph additions
 */
export function createParagraphAddPair(): { original: Document; modified: Document } {
  return {
    original: createDocxDocument({
      paragraphs: [{ text: 'First paragraph' }]
    }),
    modified: createDocxDocument({
      paragraphs: [
        { text: 'First paragraph' },
        { text: 'Second paragraph' }
      ]
    })
  };
}

/**
 * Create a document pair for testing paragraph removals
 */
export function createParagraphRemovePair(): { original: Document; modified: Document } {
  return {
    original: createDocxDocument({
      paragraphs: [
        { text: 'First paragraph' },
        { text: 'Second paragraph' }
      ]
    }),
    modified: createDocxDocument({
      paragraphs: [{ text: 'First paragraph' }]
    })
  };
}

/**
 * Create a document pair for testing bold formatting changes
 */
export function createBoldChangePair(): { original: Document; modified: Document } {
  return {
    original: createDocxDocument({
      paragraphs: [{ text: 'Important text' }]
    }),
    modified: createDocxDocument({
      paragraphs: [{ text: 'Important text', bold: true }]
    })
  };
}

/**
 * Create a document pair for testing italic formatting changes
 */
export function createItalicChangePair(): { original: Document; modified: Document } {
  return {
    original: createDocxDocument({
      paragraphs: [{ text: 'Emphasized text' }]
    }),
    modified: createDocxDocument({
      paragraphs: [{ text: 'Emphasized text', italic: true }]
    })
  };
}

/**
 * Create a document pair for testing color changes
 */
export function createColorChangePair(): { original: Document; modified: Document } {
  return {
    original: createDocxDocument({
      paragraphs: [{ text: 'Colored text', color: '000000' }]
    }),
    modified: createDocxDocument({
      paragraphs: [{ text: 'Colored text', color: 'FF0000' }]
    })
  };
}

/**
 * Create identical documents
 */
export function createIdenticalPair(): { original: Document; modified: Document } {
  const content = { text: 'This content is exactly the same' };
  return {
    original: createDocxDocument({ paragraphs: [content] }),
    modified: createDocxDocument({ paragraphs: [content] })
  };
}

/**
 * Create empty to content pair
 */
export function createEmptyToContentPair(): { original: Document; modified: Document } {
  return {
    original: createDocxDocument({ paragraphs: [] }),
    modified: createDocxDocument({
      paragraphs: [{ text: 'New content added' }]
    })
  };
}

/**
 * Create unicode document pair
 */
export function createUnicodePair(): { original: Document; modified: Document } {
  return {
    original: createDocxDocument({
      paragraphs: [{ text: 'Hello World' }]
    }),
    modified: createDocxDocument({
      paragraphs: [{ text: 'Hello 世界 🌍' }]
    })
  };
}

/**
 * Create large document pair for performance testing
 */
export function createLargePair(paragraphCount: number = 50): { original: Document; modified: Document } {
  const originalParagraphs: DocxParagraphOptions[] = [];
  const modifiedParagraphs: DocxParagraphOptions[] = [];

  for (let i = 0; i < paragraphCount; i++) {
    originalParagraphs.push({
      text: `Paragraph ${i + 1}: Lorem ipsum dolor sit amet, consectetur adipiscing elit.`
    });

    // Modify every 5th paragraph
    if (i % 5 === 0) {
      modifiedParagraphs.push({
        text: `Paragraph ${i + 1}: Lorem ipsum dolor sit amet, MODIFIED consectetur adipiscing elit.`
      });
    } else {
      modifiedParagraphs.push({
        text: `Paragraph ${i + 1}: Lorem ipsum dolor sit amet, consectetur adipiscing elit.`
      });
    }
  }

  return {
    original: createDocxDocument({ paragraphs: originalParagraphs }),
    modified: createDocxDocument({ paragraphs: modifiedParagraphs })
  };
}
