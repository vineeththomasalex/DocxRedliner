// DOCX Builder - Helper functions for creating test DOCX files

import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  Packer,
  AlignmentType,
  PageBreak,
  LevelFormat,
  AlignmentType as LevelAlignment
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

/**
 * Numbering configuration for creating numbered list documents
 */
export interface NumberingConfig {
  reference: string;
  levels: {
    level: number;
    format: 'decimal' | 'upperLetter' | 'lowerLetter' | 'upperRoman' | 'lowerRoman';
    text: string;
    alignment: 'start' | 'center' | 'end';
  }[];
}

/**
 * Create a paragraph that is part of a numbered list (uses Word's native <w:numPr>)
 */
export function createNumberedListItem(
  text: string,
  options: {
    numbering: { reference: string; level: number };
    bold?: boolean;
    italic?: boolean;
  }
): Paragraph {
  return new Paragraph({
    numbering: {
      reference: options.numbering.reference,
      level: options.numbering.level
    },
    children: [
      new TextRun({
        text,
        bold: options.bold,
        italics: options.italic
      })
    ]
  });
}

/**
 * Create a document with Word native numbered lists (<w:numPr>)
 * This creates documents where numbers are auto-generated by Word, not typed as text.
 */
export function createNativeNumberedListDocument(
  items: string[],
  options: {
    title?: string;
    author?: string;
    startNumber?: number;
  } = {}
): Document {
  const formatMap = {
    decimal: LevelFormat.DECIMAL,
    upperLetter: LevelFormat.UPPER_LETTER,
    lowerLetter: LevelFormat.LOWER_LETTER,
    upperRoman: LevelFormat.UPPER_ROMAN,
    lowerRoman: LevelFormat.LOWER_ROMAN
  };

  return new Document({
    title: options.title,
    creator: options.author,
    numbering: {
      config: [
        {
          reference: 'numbered-list-1',
          levels: [
            {
              level: 0,
              format: formatMap.decimal,
              text: '%1.',
              alignment: LevelAlignment.START,
              start: options.startNumber ?? 1
            }
          ]
        }
      ]
    },
    sections: [
      {
        children: items.map(
          (text) =>
            new Paragraph({
              numbering: {
                reference: 'numbered-list-1',
                level: 0
              },
              children: [new TextRun({ text })]
            })
        )
      }
    ]
  });
}

/**
 * Create a document with manually typed numbers (e.g., "1. Item one")
 * This is for comparison - officeparser handles these correctly.
 */
export function createManualNumberedDocument(
  items: string[],
  options: {
    title?: string;
    author?: string;
    startNumber?: number;
  } = {}
): Document {
  const startNum = options.startNumber ?? 1;
  const paragraphs: DocxParagraphOptions[] = items.map((text, index) => ({
    text: `${startNum + index}. ${text}`
  }));

  return createDocxDocument({
    title: options.title,
    author: options.author,
    paragraphs
  });
}

/**
 * Create a document with mixed content: intro, native numbered list, and conclusion
 */
export function createMixedDocumentWithNumberedList(
  intro: string,
  listItems: string[],
  conclusion: string
): Document {
  const formatMap = {
    decimal: LevelFormat.DECIMAL
  };

  return new Document({
    numbering: {
      config: [
        {
          reference: 'numbered-list-1',
          levels: [
            {
              level: 0,
              format: formatMap.decimal,
              text: '%1.',
              alignment: LevelAlignment.START
            }
          ]
        }
      ]
    },
    sections: [
      {
        children: [
          // Intro paragraph
          new Paragraph({
            children: [new TextRun({ text: intro })]
          }),
          // Numbered list items
          ...listItems.map(
            (text) =>
              new Paragraph({
                numbering: {
                  reference: 'numbered-list-1',
                  level: 0
                },
                children: [new TextRun({ text })]
              })
          ),
          // Conclusion paragraph
          new Paragraph({
            children: [new TextRun({ text: conclusion })]
          })
        ]
      }
    ]
  });
}
