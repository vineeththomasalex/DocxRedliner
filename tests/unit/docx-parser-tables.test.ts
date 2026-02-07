// Tests for DOCX table extraction functionality

import { describe, it, expect, beforeAll } from 'vitest';
import { Packer } from 'docx';
import JSZip from 'jszip';
import {
  createTableDocument,
  createTableCellModifiedPair,
  createTableRowAddedPair,
  createTableRowRemovedPair,
  createMixedDocumentWithTable
} from '../helpers/docx-builder';

// Create a minimal DocxParser for testing that extracts tables from XML
class TestableDocxParser {
  private tableCounter = 0;

  async parseBuffer(buffer: ArrayBuffer): Promise<any> {
    // Reset table counter for each document
    this.tableCounter = 0;

    // Extract tables directly from the DOCX XML
    const tableBlocks = await this.extractTables(buffer);

    return {
      metadata: {},
      blocks: tableBlocks.map(tb => tb.block)
    };
  }

  private async extractTables(buffer: ArrayBuffer): Promise<{ block: any; xmlIndex: number }[]> {
    try {
      const zip = await JSZip.loadAsync(buffer);
      const documentXml = await zip.file('word/document.xml')?.async('string');

      if (!documentXml) {
        return [];
      }

      // Parse XML using regex-based extraction for Node.js environment
      const tableBlocks: { block: any; xmlIndex: number }[] = [];

      // Find all tables
      const tableRegex = /<w:tbl[^>]*>([\s\S]*?)<\/w:tbl>/g;
      let tableMatch;
      let globalIndex = 0;

      while ((tableMatch = tableRegex.exec(documentXml)) !== null) {
        const tableContent = tableMatch[1];
        const tableId = `table-${this.tableCounter++}`;

        // Find all rows in this table
        const rowRegex = /<w:tr[^>]*>([\s\S]*?)<\/w:tr>/g;
        let rowMatch;
        let rowIdx = 0;

        while ((rowMatch = rowRegex.exec(tableContent)) !== null) {
          const rowContent = rowMatch[1];
          const cellTexts: string[] = [];

          // Find all cells in this row
          const cellRegex = /<w:tc[^>]*>([\s\S]*?)<\/w:tc>/g;
          let cellMatch;

          while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
            const cellContent = cellMatch[1];
            const cellText = this.extractTextFromCell(cellContent);
            cellTexts.push(cellText);
          }

          const rowText = cellTexts.join(' | ').trim();

          if (rowText) {
            const normalizedText = rowText.replace(/\s+/g, ' ');

            tableBlocks.push({
              block: {
                id: `block-${2000 + globalIndex}-${this.simpleHash(normalizedText)}`,
                type: 'table-row',
                text: normalizedText,
                runs: [{ text: normalizedText, formatting: {} }],
                formatting: {},
                tableId,
                rowIndex: rowIdx
              },
              xmlIndex: 2000 + globalIndex
            });
            globalIndex++;
          }
          rowIdx++;
        }
      }

      return tableBlocks;
    } catch (error) {
      console.warn('Failed to extract tables:', error);
      return [];
    }
  }

  private extractTextFromCell(cellContent: string): string {
    // Extract all text content from <w:t> elements
    const textRegex = /<w:t[^>]*>([^<]*)<\/w:t>/g;
    let text = '';
    let match;
    while ((match = textRegex.exec(cellContent)) !== null) {
      text += match[1];
    }
    return text.trim();
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }
}

describe('DOCX Table Extraction', () => {
  let parser: TestableDocxParser;

  beforeAll(() => {
    parser = new TestableDocxParser();
  });

  describe('Basic Table Extraction', () => {
    it('should extract table content as table-row blocks', async () => {
      const doc = createTableDocument({
        rows: [
          { cells: [{ text: 'Header 1' }, { text: 'Header 2' }] },
          { cells: [{ text: 'Cell A' }, { text: 'Cell B' }] }
        ]
      });

      const buffer = await Packer.toBuffer(doc);
      const ast = await parser.parseBuffer(buffer);

      expect(ast.blocks.length).toBe(2);
      expect(ast.blocks[0].type).toBe('table-row');
      expect(ast.blocks[1].type).toBe('table-row');
    });

    it('should join cells with pipe separator', async () => {
      const doc = createTableDocument({
        rows: [
          { cells: [{ text: 'Name' }, { text: 'Value' }, { text: 'Notes' }] }
        ]
      });

      const buffer = await Packer.toBuffer(doc);
      const ast = await parser.parseBuffer(buffer);

      expect(ast.blocks[0].text).toBe('Name | Value | Notes');
    });

    it('should assign tableId to link rows', async () => {
      const doc = createTableDocument({
        rows: [
          { cells: [{ text: 'Row 1' }] },
          { cells: [{ text: 'Row 2' }] },
          { cells: [{ text: 'Row 3' }] }
        ]
      });

      const buffer = await Packer.toBuffer(doc);
      const ast = await parser.parseBuffer(buffer);

      expect(ast.blocks.length).toBe(3);

      // All rows should have the same tableId
      const tableId = ast.blocks[0].tableId;
      expect(tableId).toBeDefined();
      expect(ast.blocks[1].tableId).toBe(tableId);
      expect(ast.blocks[2].tableId).toBe(tableId);
    });

    it('should assign correct rowIndex to each row', async () => {
      const doc = createTableDocument({
        rows: [
          { cells: [{ text: 'Header' }] },
          { cells: [{ text: 'Data 1' }] },
          { cells: [{ text: 'Data 2' }] }
        ]
      });

      const buffer = await Packer.toBuffer(doc);
      const ast = await parser.parseBuffer(buffer);

      expect(ast.blocks[0].rowIndex).toBe(0);
      expect(ast.blocks[1].rowIndex).toBe(1);
      expect(ast.blocks[2].rowIndex).toBe(2);
    });
  });

  describe('Table Content Comparison', () => {
    it('should detect modified cell content', async () => {
      const { original, modified } = createTableCellModifiedPair();

      const originalBuffer = await Packer.toBuffer(original);
      const modifiedBuffer = await Packer.toBuffer(modified);

      const originalAst = await parser.parseBuffer(originalBuffer);
      const modifiedAst = await parser.parseBuffer(modifiedBuffer);

      // Row with changed cell should have different text
      const originalRow2 = originalAst.blocks[1];
      const modifiedRow2 = modifiedAst.blocks[1];

      expect(originalRow2.text).toContain('100');
      expect(modifiedRow2.text).toContain('150');
    });

    it('should detect added row', async () => {
      const { original, modified } = createTableRowAddedPair();

      const originalBuffer = await Packer.toBuffer(original);
      const modifiedBuffer = await Packer.toBuffer(modified);

      const originalAst = await parser.parseBuffer(originalBuffer);
      const modifiedAst = await parser.parseBuffer(modifiedBuffer);

      expect(originalAst.blocks.length).toBe(2);
      expect(modifiedAst.blocks.length).toBe(3);
    });

    it('should detect removed row', async () => {
      const { original, modified } = createTableRowRemovedPair();

      const originalBuffer = await Packer.toBuffer(original);
      const modifiedBuffer = await Packer.toBuffer(modified);

      const originalAst = await parser.parseBuffer(originalBuffer);
      const modifiedAst = await parser.parseBuffer(modifiedBuffer);

      expect(originalAst.blocks.length).toBe(3);
      expect(modifiedAst.blocks.length).toBe(2);
    });
  });

  describe('Mixed Content Documents', () => {
    it('should extract tables from mixed content documents', async () => {
      const doc = createMixedDocumentWithTable(
        'Introduction text',
        [
          { cells: [{ text: 'Col A' }, { text: 'Col B' }] },
          { cells: [{ text: 'Data 1' }, { text: 'Data 2' }] }
        ],
        'Conclusion text'
      );

      const buffer = await Packer.toBuffer(doc);
      const ast = await parser.parseBuffer(buffer);

      // Should have extracted the table rows
      expect(ast.blocks.length).toBe(2);
      expect(ast.blocks[0].type).toBe('table-row');
      expect(ast.blocks[1].type).toBe('table-row');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty cells', async () => {
      const doc = createTableDocument({
        rows: [
          { cells: [{ text: 'Value' }, { text: '' }] }
        ]
      });

      const buffer = await Packer.toBuffer(doc);
      const ast = await parser.parseBuffer(buffer);

      expect(ast.blocks.length).toBe(1);
      // Empty cell produces "Value |" with trailing pipe
      expect(ast.blocks[0].text).toBe('Value |');
    });

    it('should normalize whitespace in cell content', async () => {
      const doc = createTableDocument({
        rows: [
          { cells: [{ text: 'Extra   spaces' }] }
        ]
      });

      const buffer = await Packer.toBuffer(doc);
      const ast = await parser.parseBuffer(buffer);

      expect(ast.blocks[0].text).toBe('Extra spaces');
    });
  });
});
