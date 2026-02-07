// Unit tests for DOCX Parser - Numbered List Extraction
// TDD tests for fixing the officeparser limitations with Word native numbered lists

import { describe, it, expect } from 'vitest';
import { readFile } from 'fs/promises';
import { parseOffice } from 'officeparser';
import JSZip from 'jszip';
import type { DocumentAST, Block, TextFormatting, TextRun } from '../../src/types/ast.types';

// Path to test fixtures
const FIXTURES_PATH = 'tests/fixtures/synthetic/docs';

/**
 * Helper to normalize officeparser output to AST format
 * This mirrors the logic in DocxParser.normalizeAST()
 */
function normalizeToAST(result: any): DocumentAST {
  const blocks: Block[] = [];

  if (result.content && Array.isArray(result.content)) {
    result.content.forEach((item: any, index: number) => {
      if (item.type === 'paragraph' || item.type === 'heading') {
        const text = item.text || '';
        if (text.trim()) {
          const formatting: TextFormatting = {
            bold: item.bold,
            italic: item.italic,
            underline: item.underline,
            color: item.color,
            font: item.font,
            fontSize: item.fontSize
          };

          const runs: TextRun[] = item.runs?.map((run: any) => ({
            text: run.text || text,
            formatting: {
              bold: run.bold,
              italic: run.italic,
              underline: run.underline,
              color: run.color,
              font: run.font,
              fontSize: run.fontSize
            }
          })) || [{ text, formatting }];

          blocks.push({
            id: `block-${index}`,
            type: item.type === 'heading' ? 'heading1' : 'paragraph',
            text: text.trim().replace(/\s+/g, ' '),
            runs,
            formatting
          });
        }
      }
    });
  }

  return {
    metadata: {
      author: result.author,
      title: result.title,
      created: result.created ? new Date(result.created) : undefined,
      modified: result.modified ? new Date(result.modified) : undefined
    },
    blocks
  };
}

/**
 * Helper to check if a DOCX contains <w:numPr> elements (native numbering)
 */
async function hasNativeNumbering(buffer: Buffer): Promise<boolean> {
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file('word/document.xml')?.async('string');
  return documentXml?.includes('<w:numPr') ?? false;
}

/**
 * Enhanced parser that extracts numbered list content (mirrors DocxParser behavior).
 * This is a Node.js compatible implementation for testing.
 */
async function parseWithNumberedLists(buffer: Buffer): Promise<DocumentAST> {
  // Step 1: Use officeparser (existing behavior)
  const result = await parseOffice(buffer);
  const ast = normalizeToAST(result);

  // Step 2: Extract numbered list content that officeparser missed
  const numberedListBlocks = await extractNumberedLists(buffer);

  // Step 3: Merge numbered list blocks with existing blocks
  if (numberedListBlocks.length > 0) {
    ast.blocks = mergeBlocks(ast.blocks, numberedListBlocks);
  }

  return ast;
}

/**
 * Extract content from paragraphs with Word native numbered lists (<w:numPr>).
 */
async function extractNumberedLists(buffer: Buffer): Promise<{ block: Block; xmlIndex: number }[]> {
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file('word/document.xml')?.async('string');

  if (!documentXml) {
    return [];
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(documentXml, 'application/xml');

  const numberedBlocks: { block: Block; xmlIndex: number }[] = [];
  const pElements = doc.getElementsByTagName('w:p');

  for (let i = 0; i < pElements.length; i++) {
    const p = pElements[i];
    const numPr = p.getElementsByTagName('w:numPr');

    if (numPr.length > 0) {
      // This paragraph has native numbering - extract its content
      const textElements = p.getElementsByTagName('w:t');
      let text = '';
      for (let j = 0; j < textElements.length; j++) {
        text += textElements[j].textContent || '';
      }

      if (text.trim()) {
        const normalizedText = text.trim().replace(/\s+/g, ' ');
        const formatting = extractFormattingFromParagraph(p);

        numberedBlocks.push({
          block: {
            id: `block-${1000 + i}`,
            type: 'paragraph',
            text: normalizedText,
            runs: [{ text: normalizedText, formatting }],
            formatting
          },
          xmlIndex: i
        });
      }
    }
  }

  return numberedBlocks;
}

/**
 * Extract formatting from a <w:p> element
 */
function extractFormattingFromParagraph(p: Element): TextFormatting {
  const formatting: TextFormatting = {};

  // Check for bold
  const boldElements = p.getElementsByTagName('w:b');
  if (boldElements.length > 0) {
    const val = boldElements[0].getAttribute('w:val');
    if (val === null || val === '' || val === 'true' || val === '1') {
      formatting.bold = true;
    }
  }

  // Check for italic
  const italicElements = p.getElementsByTagName('w:i');
  if (italicElements.length > 0) {
    const val = italicElements[0].getAttribute('w:val');
    if (val === null || val === '' || val === 'true' || val === '1') {
      formatting.italic = true;
    }
  }

  // Check for underline
  const underlineElements = p.getElementsByTagName('w:u');
  if (underlineElements.length > 0) {
    const val = underlineElements[0].getAttribute('w:val');
    if (val && val !== 'none') {
      formatting.underline = true;
    }
  }

  return formatting;
}

/**
 * Merge numbered list blocks with existing blocks from officeparser.
 */
function mergeBlocks(existingBlocks: Block[], numberedBlocks: { block: Block; xmlIndex: number }[]): Block[] {
  if (numberedBlocks.length === 0) {
    return existingBlocks;
  }

  // If there are no existing blocks, just return the numbered blocks in order
  if (existingBlocks.length === 0) {
    return numberedBlocks.map(nb => nb.block);
  }

  // Create a set of existing block texts for deduplication
  const existingTexts = new Set(existingBlocks.map(b => b.text.toLowerCase().trim()));

  // Filter out numbered blocks that are already in the existing blocks
  const newNumberedBlocks = numberedBlocks.filter(
    nb => !existingTexts.has(nb.block.text.toLowerCase().trim())
  );

  if (newNumberedBlocks.length === 0) {
    return existingBlocks;
  }

  // Sort numbered blocks by their XML index
  newNumberedBlocks.sort((a, b) => a.xmlIndex - b.xmlIndex);

  // Merge blocks - interleave based on position
  const result: Block[] = [];
  let existingIdx = 0;
  let numberedIdx = 0;

  while (existingIdx < existingBlocks.length || numberedIdx < newNumberedBlocks.length) {
    // Add numbered blocks
    while (numberedIdx < newNumberedBlocks.length) {
      if (existingIdx >= existingBlocks.length) {
        result.push(newNumberedBlocks[numberedIdx].block);
        numberedIdx++;
        continue;
      }

      const numberedXmlIndex = newNumberedBlocks[numberedIdx].xmlIndex;
      if (numberedIdx === 0 || numberedXmlIndex < (existingIdx + numberedIdx) * 2) {
        result.push(newNumberedBlocks[numberedIdx].block);
        numberedIdx++;
      } else {
        break;
      }
    }

    if (existingIdx < existingBlocks.length) {
      result.push(existingBlocks[existingIdx]);
      existingIdx++;
    }
  }

  // Regenerate IDs
  return result.map((block, index) => ({
    ...block,
    id: `block-${index}`
  }));
}

/**
 * Helper to extract raw text from <w:p> elements with <w:numPr>
 */
async function extractNumberedParagraphsFromXML(buffer: Buffer): Promise<string[]> {
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file('word/document.xml')?.async('string');

  if (!documentXml) return [];

  const parser = new DOMParser();
  const doc = parser.parseFromString(documentXml, 'application/xml');

  const paragraphs: string[] = [];
  const pElements = doc.getElementsByTagName('w:p');

  for (let i = 0; i < pElements.length; i++) {
    const p = pElements[i];
    const numPr = p.getElementsByTagName('w:numPr');

    if (numPr.length > 0) {
      // This paragraph has native numbering
      const textElements = p.getElementsByTagName('w:t');
      let text = '';
      for (let j = 0; j < textElements.length; j++) {
        text += textElements[j].textContent || '';
      }
      if (text.trim()) {
        paragraphs.push(text.trim());
      }
    }
  }

  return paragraphs;
}

describe('DocxParser - Numbered List Extraction', () => {

  describe('Test fixture verification', () => {
    it('should have created native-numbered-list fixture with <w:numPr> elements', async () => {
      const buffer = await readFile(`${FIXTURES_PATH}/22-native-numbered-list_original.docx`);
      const hasNumbering = await hasNativeNumbering(buffer);

      expect(hasNumbering).toBe(true);
    });

    it('should have created manual-numbered-list fixture WITHOUT <w:numPr> elements', async () => {
      const buffer = await readFile(`${FIXTURES_PATH}/23-manual-numbered-list_original.docx`);
      const hasNumbering = await hasNativeNumbering(buffer);

      // Manual numbered lists don't use <w:numPr>
      expect(hasNumbering).toBe(false);
    });

    it('should confirm numbered content exists in XML for native list', async () => {
      const buffer = await readFile(`${FIXTURES_PATH}/22-native-numbered-list_original.docx`);
      const numberedTexts = await extractNumberedParagraphsFromXML(buffer);

      // The document should contain these items
      expect(numberedTexts).toContain('PURCHASE OF SHARES');
      expect(numberedTexts).toContain('PAYMENT OF PURCHASE PRICE');
      expect(numberedTexts.length).toBe(4);
    });
  });

  describe('Documenting officeparser limitations with native numbered lists', () => {
    /**
     * These tests document that officeparser alone does NOT extract
     * content from paragraphs with <w:numPr> (Word native numbered lists).
     * This is why we need our enhanced extraction.
     */
    it('officeparser returns 0 blocks for native numbered list document', async () => {
      const buffer = await readFile(`${FIXTURES_PATH}/22-native-numbered-list_original.docx`);
      const result = await parseOffice(buffer);
      const ast = normalizeToAST(result);

      // Documenting the limitation: officeparser skips <w:numPr> paragraphs
      expect(ast.blocks.length).toBe(0);
    });

    it('officeparser only extracts non-numbered content from mixed document', async () => {
      const buffer = await readFile(`${FIXTURES_PATH}/24-mixed-with-numbered-list_original.docx`);
      const result = await parseOffice(buffer);
      const ast = normalizeToAST(result);

      // Document has 5 blocks total, but officeparser only finds 2 (intro and conclusion)
      expect(ast.blocks.length).toBe(2);

      const texts = ast.blocks.map(b => b.text);

      // Intro and conclusion ARE extracted
      expect(texts.some(t => t.includes('provisions'))).toBe(true);
      expect(texts.some(t => t.includes('parties agree'))).toBe(true);

      // But numbered list items are NOT extracted
      expect(texts.some(t => t.includes('PURCHASE OF SHARES'))).toBe(false);
    });
  });

  describe('PASSING TESTS - manual numbering works correctly', () => {
    /**
     * This test demonstrates that manually typed numbers (e.g., "1. Item")
     * ARE correctly extracted by officeparser.
     */
    it('should extract manually numbered paragraphs', async () => {
      const buffer = await readFile(`${FIXTURES_PATH}/23-manual-numbered-list_original.docx`);
      const result = await parseOffice(buffer);
      const ast = normalizeToAST(result);

      // Manual numbering DOES work
      expect(ast.blocks.length).toBe(3);

      const texts = ast.blocks.map(b => b.text);
      expect(texts.some(t => t.startsWith('1.'))).toBe(true);
      expect(texts.some(t => t.startsWith('2.'))).toBe(true);
      expect(texts.some(t => t.startsWith('3.'))).toBe(true);
    });

    it('should preserve text content in manually numbered items', async () => {
      const buffer = await readFile(`${FIXTURES_PATH}/23-manual-numbered-list_original.docx`);
      const result = await parseOffice(buffer);
      const ast = normalizeToAST(result);

      expect(ast.blocks.some(b => b.text.includes('First item'))).toBe(true);
      expect(ast.blocks.some(b => b.text.includes('Second item'))).toBe(true);
      expect(ast.blocks.some(b => b.text.includes('Third item'))).toBe(true);
    });
  });

  describe('Diff comparison tests - shows false positives with raw officeparser', () => {
    /**
     * When content exists in both documents but officeparser can't see it in native lists,
     * the diff engine incorrectly shows content as "deleted" or "inserted"
     */
    it('officeparser alone fails to extract native numbered lists', async () => {
      const originalBuffer = await readFile(`${FIXTURES_PATH}/22-native-numbered-list_original.docx`);
      const modifiedBuffer = await readFile(`${FIXTURES_PATH}/22-native-numbered-list_modified.docx`);

      const originalResult = await parseOffice(originalBuffer);
      const modifiedResult = await parseOffice(modifiedBuffer);

      const originalAst = normalizeToAST(originalResult);
      const modifiedAst = normalizeToAST(modifiedResult);

      // Both documents are identical, but officeparser returns 0 blocks
      // This documents the limitation we're fixing
      expect(originalAst.blocks.length).toBe(0);
      expect(modifiedAst.blocks.length).toBe(0);
    });
  });

  describe('ENHANCED PARSER - fixes numbered list extraction', () => {
    /**
     * These tests verify our enhanced parser correctly extracts numbered lists
     */
    it('should extract content from Word native numbered lists (<w:numPr>)', async () => {
      const buffer = await readFile(`${FIXTURES_PATH}/22-native-numbered-list_original.docx`);
      const ast = await parseWithNumberedLists(buffer);

      // We expect 4 items to be extracted
      expect(ast.blocks.length).toBe(4);

      // Check that specific content was extracted
      const texts = ast.blocks.map(b => b.text);
      expect(texts).toContain('PURCHASE OF SHARES');
      expect(texts).toContain('PAYMENT OF PURCHASE PRICE');
      expect(texts).toContain('REPRESENTATIONS AND WARRANTIES');
      expect(texts).toContain('CLOSING CONDITIONS');
    });

    it('should extract numbered list items in correct order', async () => {
      const buffer = await readFile(`${FIXTURES_PATH}/22-native-numbered-list_original.docx`);
      const ast = await parseWithNumberedLists(buffer);

      expect(ast.blocks.length).toBeGreaterThan(0);

      // Items should appear in order
      const texts = ast.blocks.map(b => b.text);
      const purchaseIndex = texts.findIndex(t => t.includes('PURCHASE OF SHARES'));
      const paymentIndex = texts.findIndex(t => t.includes('PAYMENT OF PURCHASE PRICE'));

      expect(purchaseIndex).toBeGreaterThanOrEqual(0);
      expect(paymentIndex).toBeGreaterThanOrEqual(0);
      expect(purchaseIndex).toBeLessThan(paymentIndex);
    });

    it('should extract content from mixed document with intro, numbered list, and conclusion', async () => {
      const buffer = await readFile(`${FIXTURES_PATH}/24-mixed-with-numbered-list_original.docx`);
      const ast = await parseWithNumberedLists(buffer);

      // Document has: intro (1) + numbered list items (3) + conclusion (1) = 5 blocks
      expect(ast.blocks.length).toBe(5);

      const texts = ast.blocks.map(b => b.text);

      // Intro should be extracted
      expect(texts.some(t => t.includes('provisions'))).toBe(true);

      // Numbered list items should be extracted
      expect(texts.some(t => t.includes('PURCHASE OF SHARES'))).toBe(true);
      expect(texts.some(t => t.includes('PAYMENT OF PURCHASE PRICE'))).toBe(true);

      // Conclusion should be extracted
      expect(texts.some(t => t.includes('parties agree'))).toBe(true);
    });

    it('should NOT show changes when both documents have identical native numbered lists', async () => {
      const originalBuffer = await readFile(`${FIXTURES_PATH}/22-native-numbered-list_original.docx`);
      const modifiedBuffer = await readFile(`${FIXTURES_PATH}/22-native-numbered-list_modified.docx`);

      const originalAst = await parseWithNumberedLists(originalBuffer);
      const modifiedAst = await parseWithNumberedLists(modifiedBuffer);

      // Both documents are identical, so they should have the same number of blocks
      expect(originalAst.blocks.length).toBe(modifiedAst.blocks.length);
      expect(originalAst.blocks.length).toBe(4);
    });

    it('should correctly detect actual changes in numbered list content', async () => {
      const originalBuffer = await readFile(`${FIXTURES_PATH}/25-numbered-list-modified_original.docx`);
      const modifiedBuffer = await readFile(`${FIXTURES_PATH}/25-numbered-list-modified_modified.docx`);

      const originalAst = await parseWithNumberedLists(originalBuffer);
      const modifiedAst = await parseWithNumberedLists(modifiedBuffer);

      // Original has 3 items, modified has 4 (one item added)
      expect(originalAst.blocks.length).toBe(3);
      expect(modifiedAst.blocks.length).toBe(4);
    });

    it('should still correctly handle manual numbered lists', async () => {
      const buffer = await readFile(`${FIXTURES_PATH}/23-manual-numbered-list_original.docx`);
      const ast = await parseWithNumberedLists(buffer);

      // Manual numbering should still work
      expect(ast.blocks.length).toBe(3);

      const texts = ast.blocks.map(b => b.text);
      expect(texts.some(t => t.startsWith('1.'))).toBe(true);
      expect(texts.some(t => t.startsWith('2.'))).toBe(true);
      expect(texts.some(t => t.startsWith('3.'))).toBe(true);
    });
  });
});
