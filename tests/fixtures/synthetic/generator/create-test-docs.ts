#!/usr/bin/env npx tsx
// Synthetic Test Document Generator
// Generates controlled test document pairs for automated testing

import { Document, Paragraph, TextRun, HeadingLevel, Packer, PageBreak, LevelFormat, AlignmentType, Table, TableRow, TableCell, WidthType } from 'docx';
import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const OUTPUT_DIR = join(__dirname, '..', 'docs');

interface TestScenario {
  name: string;
  description: string;
  original: Document;
  modified: Document;
}

function createParagraph(text: string, options: {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  font?: string;
  size?: number;
  heading?: HeadingLevel;
} = {}): Paragraph {
  return new Paragraph({
    heading: options.heading,
    children: [
      new TextRun({
        text,
        bold: options.bold,
        italics: options.italic,
        underline: options.underline ? {} : undefined,
        color: options.color,
        font: options.font,
        size: options.size ? options.size * 2 : undefined
      })
    ]
  });
}

function createDocument(paragraphs: Paragraph[]): Document {
  return new Document({
    sections: [{
      properties: {},
      children: paragraphs
    }]
  });
}

// ============= Table Helper Functions =============

interface TableCellData {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

/**
 * Create a table cell with optional formatting
 */
function createTableCell(data: TableCellData): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text: data.text,
            bold: data.bold,
            italics: data.italic
          })
        ]
      })
    ]
  });
}

/**
 * Create a table row from cell data array
 */
function createTableRow(cells: TableCellData[]): TableRow {
  return new TableRow({
    children: cells.map(cell => createTableCell(cell))
  });
}

/**
 * Create a table from row data
 */
function createTableFromRows(rows: TableCellData[][]): Table {
  return new Table({
    rows: rows.map(row => createTableRow(row)),
    width: {
      size: 9000,
      type: WidthType.DXA
    }
  });
}

/**
 * Create a document containing a table
 */
function createTableDocument(rows: TableCellData[][]): Document {
  return new Document({
    sections: [{
      properties: {},
      children: [createTableFromRows(rows)]
    }]
  });
}

/**
 * Create a document with mixed content: intro paragraph, table, and conclusion paragraph
 */
function createMixedDocumentWithTable(
  intro: string,
  tableRows: TableCellData[][],
  conclusion: string
): Document {
  return new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({ children: [new TextRun({ text: intro })] }),
        createTableFromRows(tableRows),
        new Paragraph({ children: [new TextRun({ text: conclusion })] })
      ]
    }]
  });
}

// Define all test scenarios
const scenarios: TestScenario[] = [
  // 1. Word insertion
  {
    name: '01-word-insertion',
    description: 'Tests word-level diff for insertions',
    original: createDocument([
      createParagraph('Hello world')
    ]),
    modified: createDocument([
      createParagraph('Hello beautiful world')
    ])
  },

  // 2. Word deletion
  {
    name: '02-word-deletion',
    description: 'Tests word-level diff for deletions',
    original: createDocument([
      createParagraph('Hello beautiful world')
    ]),
    modified: createDocument([
      createParagraph('Hello world')
    ])
  },

  // 3. Paragraph added
  {
    name: '03-paragraph-added',
    description: 'Tests block insertion detection',
    original: createDocument([
      createParagraph('First paragraph')
    ]),
    modified: createDocument([
      createParagraph('First paragraph'),
      createParagraph('Second paragraph')
    ])
  },

  // 4. Paragraph removed
  {
    name: '04-paragraph-removed',
    description: 'Tests block deletion detection',
    original: createDocument([
      createParagraph('First paragraph'),
      createParagraph('Second paragraph')
    ]),
    modified: createDocument([
      createParagraph('First paragraph')
    ])
  },

  // 5. Bold added
  {
    name: '05-bold-added',
    description: 'Tests formatting detection - bold',
    original: createDocument([
      createParagraph('Important text')
    ]),
    modified: createDocument([
      createParagraph('Important text', { bold: true })
    ])
  },

  // 6. Italic added
  {
    name: '06-italic-added',
    description: 'Tests formatting detection - italic',
    original: createDocument([
      createParagraph('Emphasized text')
    ]),
    modified: createDocument([
      createParagraph('Emphasized text', { italic: true })
    ])
  },

  // 7. Color changed
  {
    name: '07-color-changed',
    description: 'Tests formatting detection - color',
    original: createDocument([
      createParagraph('Colored text', { color: '000000' })
    ]),
    modified: createDocument([
      createParagraph('Colored text', { color: 'FF0000' })
    ])
  },

  // 8. Identical documents
  {
    name: '08-identical',
    description: 'Tests zero changes baseline',
    original: createDocument([
      createParagraph('This content is exactly the same.'),
      createParagraph('So is this second paragraph.')
    ]),
    modified: createDocument([
      createParagraph('This content is exactly the same.'),
      createParagraph('So is this second paragraph.')
    ])
  },

  // 9. Empty to content
  {
    name: '09-empty-to-content',
    description: 'Tests edge case - empty document to content',
    original: createDocument([]),
    modified: createDocument([
      createParagraph('New content has been added to the document.')
    ])
  },

  // 10. Unicode text
  {
    name: '10-unicode',
    description: 'Tests character handling with CJK, Arabic, and emoji',
    original: createDocument([
      createParagraph('Hello World'),
      createParagraph('Simple English text')
    ]),
    modified: createDocument([
      createParagraph('Hello 世界 🌍'),
      createParagraph('日本語テキスト and العربية mixed with English')
    ])
  },

  // 11. Multiple changes
  {
    name: '11-multiple-changes',
    description: 'Tests multiple types of changes in one document',
    original: createDocument([
      createParagraph('Introduction', { heading: HeadingLevel.HEADING_1 }),
      createParagraph('This is the first paragraph of the document.'),
      createParagraph('This paragraph will be modified.'),
      createParagraph('This paragraph will be deleted.'),
      createParagraph('Conclusion', { heading: HeadingLevel.HEADING_1 }),
      createParagraph('Final thoughts on the matter.')
    ]),
    modified: createDocument([
      createParagraph('Introduction', { heading: HeadingLevel.HEADING_1 }),
      createParagraph('This is the first paragraph of the document.'),
      createParagraph('This paragraph has been significantly modified with new content.'),
      createParagraph('A brand new paragraph was inserted here.'),
      createParagraph('Conclusion', { heading: HeadingLevel.HEADING_1 }),
      createParagraph('Final thoughts on the matter with additional commentary.')
    ])
  },

  // 12. Underline added
  {
    name: '12-underline-added',
    description: 'Tests formatting detection - underline',
    original: createDocument([
      createParagraph('Underlined text')
    ]),
    modified: createDocument([
      createParagraph('Underlined text', { underline: true })
    ])
  },

  // 13. Font changed
  {
    name: '13-font-changed',
    description: 'Tests formatting detection - font family',
    original: createDocument([
      createParagraph('Text with default font')
    ]),
    modified: createDocument([
      createParagraph('Text with default font', { font: 'Arial' })
    ])
  },

  // 14. Font size changed
  {
    name: '14-font-size-changed',
    description: 'Tests formatting detection - font size',
    original: createDocument([
      createParagraph('Normal sized text', { size: 12 })
    ]),
    modified: createDocument([
      createParagraph('Normal sized text', { size: 16 })
    ])
  },

  // 15. Word replacement
  {
    name: '15-word-replacement',
    description: 'Tests word-level diff for replacements',
    original: createDocument([
      createParagraph('The quick brown fox jumps over the lazy dog.')
    ]),
    modified: createDocument([
      createParagraph('The fast brown fox leaps over the sleepy dog.')
    ])
  },

  // 16. Heading changes
  {
    name: '16-heading-changes',
    description: 'Tests heading text and level changes',
    original: createDocument([
      createParagraph('Original Title', { heading: HeadingLevel.HEADING_1 }),
      createParagraph('Content under the title.')
    ]),
    modified: createDocument([
      createParagraph('Modified Title', { heading: HeadingLevel.HEADING_1 }),
      createParagraph('Content under the title.')
    ])
  },

  // 17. Long paragraphs
  {
    name: '17-long-paragraphs',
    description: 'Tests diff with long paragraph content',
    original: createDocument([
      createParagraph('Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.')
    ]),
    modified: createDocument([
      createParagraph('Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris. INSERTED TEXT HERE. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.')
    ])
  },

  // 18. Special characters
  {
    name: '18-special-characters',
    description: 'Tests handling of special characters',
    original: createDocument([
      createParagraph('Text with "quotes" and \'apostrophes\''),
      createParagraph('Symbols: & < > © ® ™ § ¶')
    ]),
    modified: createDocument([
      createParagraph('Text with "quotes" and \'apostrophes\' - modified'),
      createParagraph('Symbols: & < > © ® ™ § ¶ ± ≠ ≤ ≥')
    ])
  },

  // 19. Whitespace changes
  {
    name: '19-whitespace',
    description: 'Tests handling of whitespace changes',
    original: createDocument([
      createParagraph('Text  with   multiple    spaces'),
      createParagraph('Normal spacing here')
    ]),
    modified: createDocument([
      createParagraph('Text with multiple spaces'),
      createParagraph('Normal  spacing  here')
    ])
  },

  // 20. Page breaks (simulated with multiple paragraphs)
  {
    name: '20-with-page-break',
    description: 'Tests document with page breaks',
    original: createDocument([
      createParagraph('Content before page break'),
      new Paragraph({ children: [new PageBreak()] }),
      createParagraph('Content after page break')
    ]),
    modified: createDocument([
      createParagraph('Modified content before page break'),
      new Paragraph({ children: [new PageBreak()] }),
      createParagraph('Content after page break')
    ])
  },

  // 22. Native numbered lists (Word <w:numPr>)
  {
    name: '22-native-numbered-list',
    description: 'Tests Word native numbered lists with auto-generated numbers',
    original: createNativeNumberedListDocument([
      'PURCHASE OF SHARES',
      'PAYMENT OF PURCHASE PRICE',
      'REPRESENTATIONS AND WARRANTIES',
      'CLOSING CONDITIONS'
    ]),
    modified: createNativeNumberedListDocument([
      'PURCHASE OF SHARES',
      'PAYMENT OF PURCHASE PRICE',
      'REPRESENTATIONS AND WARRANTIES',
      'CLOSING CONDITIONS'
    ])
  },

  // 23. Manual numbered list (typed numbers)
  {
    name: '23-manual-numbered-list',
    description: 'Tests manually typed numbered lists (1., 2., etc.)',
    original: createManualNumberedDocument([
      'First item',
      'Second item',
      'Third item'
    ]),
    modified: createManualNumberedDocument([
      'First item',
      'Second item',
      'Third item'
    ])
  },

  // 24. Mixed content with native numbered list
  {
    name: '24-mixed-with-numbered-list',
    description: 'Tests document with intro, native numbered list, and conclusion',
    original: createMixedDocumentWithNumberedList(
      'This Agreement contains the following provisions:',
      [
        'PURCHASE OF SHARES',
        'PAYMENT OF PURCHASE PRICE',
        'CLOSING CONDITIONS'
      ],
      'The parties agree to the terms above.'
    ),
    modified: createMixedDocumentWithNumberedList(
      'This Agreement contains the following provisions:',
      [
        'PURCHASE OF SHARES',
        'PAYMENT OF PURCHASE PRICE',
        'CLOSING CONDITIONS'
      ],
      'The parties agree to the terms above.'
    )
  },

  // 25. Native numbered list with modifications
  {
    name: '25-numbered-list-modified',
    description: 'Tests diff of native numbered lists with changes',
    original: createNativeNumberedListDocument([
      'PURCHASE OF SHARES',
      'PAYMENT OF PURCHASE PRICE',
      'REPRESENTATIONS AND WARRANTIES'
    ]),
    modified: createNativeNumberedListDocument([
      'PURCHASE OF SHARES',
      'PAYMENT OF PURCHASE PRICE AND TERMS',
      'REPRESENTATIONS AND WARRANTIES',
      'NEW SECTION ADDED'
    ])
  },

  // 26. Basic table extraction
  {
    name: '26-table-basic',
    description: 'Tests basic table content extraction',
    original: createTableDocument([
      [{ text: 'Header 1' }, { text: 'Header 2' }],
      [{ text: 'Cell A' }, { text: 'Cell B' }],
      [{ text: 'Cell C' }, { text: 'Cell D' }]
    ]),
    modified: createTableDocument([
      [{ text: 'Header 1' }, { text: 'Header 2' }],
      [{ text: 'Cell A' }, { text: 'Cell B' }],
      [{ text: 'Cell C' }, { text: 'Cell D' }]
    ])
  },

  // 27. Table with modified cell
  {
    name: '27-table-cell-modified',
    description: 'Tests table cell content modification detection',
    original: createTableDocument([
      [{ text: 'Name' }, { text: 'Value' }],
      [{ text: 'Item A' }, { text: '100' }],
      [{ text: 'Item B' }, { text: '200' }]
    ]),
    modified: createTableDocument([
      [{ text: 'Name' }, { text: 'Value' }],
      [{ text: 'Item A' }, { text: '150' }],  // Value changed from 100 to 150
      [{ text: 'Item B' }, { text: '200' }]
    ])
  },

  // 28. Table with added row
  {
    name: '28-table-row-added',
    description: 'Tests table row addition detection',
    original: createTableDocument([
      [{ text: 'Name' }, { text: 'Value' }],
      [{ text: 'Item A' }, { text: '100' }]
    ]),
    modified: createTableDocument([
      [{ text: 'Name' }, { text: 'Value' }],
      [{ text: 'Item A' }, { text: '100' }],
      [{ text: 'Item B' }, { text: '200' }]  // New row
    ])
  },

  // 29. Table with removed row
  {
    name: '29-table-row-removed',
    description: 'Tests table row removal detection',
    original: createTableDocument([
      [{ text: 'Name' }, { text: 'Value' }],
      [{ text: 'Item A' }, { text: '100' }],
      [{ text: 'Item B' }, { text: '200' }]
    ]),
    modified: createTableDocument([
      [{ text: 'Name' }, { text: 'Value' }],
      [{ text: 'Item A' }, { text: '100' }]
      // Item B row removed
    ])
  },

  // 30. Table with formatting changes
  {
    name: '30-table-formatting',
    description: 'Tests table cell formatting change detection',
    original: createTableDocument([
      [{ text: 'Header' }, { text: 'Data' }],
      [{ text: 'Normal text' }, { text: 'Value' }]
    ]),
    modified: createTableDocument([
      [{ text: 'Header', bold: true }, { text: 'Data', bold: true }],
      [{ text: 'Normal text' }, { text: 'Value' }]
    ])
  },

  // 31. Mixed content with table
  {
    name: '31-mixed-with-table',
    description: 'Tests document with paragraphs and table',
    original: createMixedDocumentWithTable(
      'This document contains a table:',
      [
        [{ text: 'Name' }, { text: 'Value' }],
        [{ text: 'Item' }, { text: '100' }]
      ],
      'End of document.'
    ),
    modified: createMixedDocumentWithTable(
      'This document contains a table:',
      [
        [{ text: 'Name' }, { text: 'Value' }],
        [{ text: 'Item' }, { text: '200' }]  // Value changed
      ],
      'End of document.'
    )
  }
];

/**
 * Create a document with Word native numbered lists (<w:numPr>)
 * Numbers are auto-generated by Word, not typed as text.
 */
function createNativeNumberedListDocument(items: string[]): Document {
  return new Document({
    numbering: {
      config: [
        {
          reference: 'numbered-list-1',
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: '%1.',
              alignment: AlignmentType.START,
              start: 1
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
 */
function createManualNumberedDocument(items: string[]): Document {
  return createDocument(
    items.map((text, index) => createParagraph(`${index + 1}. ${text}`))
  );
}

/**
 * Create a document with mixed content: intro, native numbered list, and conclusion
 */
function createMixedDocumentWithNumberedList(
  intro: string,
  listItems: string[],
  conclusion: string
): Document {
  return new Document({
    numbering: {
      config: [
        {
          reference: 'numbered-list-1',
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: '%1.',
              alignment: AlignmentType.START
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

// Generate large document scenario separately (for performance testing)
function generateLargeScenario(paragraphCount: number): TestScenario {
  const originalParagraphs: Paragraph[] = [];
  const modifiedParagraphs: Paragraph[] = [];

  for (let i = 0; i < paragraphCount; i++) {
    const text = `Paragraph ${i + 1}: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.`;
    originalParagraphs.push(createParagraph(text));

    // Modify every 10th paragraph
    if (i % 10 === 0) {
      modifiedParagraphs.push(createParagraph(
        `Paragraph ${i + 1}: Lorem ipsum dolor sit amet, MODIFIED consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.`
      ));
    } else {
      modifiedParagraphs.push(createParagraph(text));
    }
  }

  return {
    name: '21-large-document',
    description: `Performance test with ${paragraphCount} paragraphs`,
    original: createDocument(originalParagraphs),
    modified: createDocument(modifiedParagraphs)
  };
}

async function main() {
  console.log('Generating synthetic test documents...\n');

  // Create output directory
  await mkdir(OUTPUT_DIR, { recursive: true });

  // Add large document scenario
  const allScenarios = [...scenarios, generateLargeScenario(50)];

  // Generate each scenario
  for (const scenario of allScenarios) {
    const originalPath = join(OUTPUT_DIR, `${scenario.name}_original.docx`);
    const modifiedPath = join(OUTPUT_DIR, `${scenario.name}_modified.docx`);

    const originalBuffer = await Packer.toBuffer(scenario.original);
    const modifiedBuffer = await Packer.toBuffer(scenario.modified);

    await writeFile(originalPath, originalBuffer);
    await writeFile(modifiedPath, modifiedBuffer);

    console.log(`✓ ${scenario.name}`);
    console.log(`  ${scenario.description}`);
    console.log(`  → ${originalPath}`);
    console.log(`  → ${modifiedPath}\n`);
  }

  console.log(`\nGenerated ${allScenarios.length} test document pairs in ${OUTPUT_DIR}`);

  // Generate manifest file
  const manifest = {
    generated: new Date().toISOString(),
    scenarios: allScenarios.map(s => ({
      name: s.name,
      description: s.description,
      original: `${s.name}_original.docx`,
      modified: `${s.name}_modified.docx`
    }))
  };

  await writeFile(
    join(OUTPUT_DIR, 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  );

  console.log('Generated manifest.json');
}

main().catch(console.error);
