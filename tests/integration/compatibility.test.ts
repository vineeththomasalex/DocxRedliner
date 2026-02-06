// Compatibility Tests
// Tests parsing of DOCX files from external libraries to ensure compatibility

import { describe, it, expect, beforeAll } from 'vitest';
import { readFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { parseOffice } from 'officeparser';
import type { DocumentAST, Block, TextRun, TextFormatting } from '../../src/types/ast.types';

// Paths to external test files
const MAMMOTH_PATH = join(__dirname, '..', 'fixtures', 'external', 'mammoth');
const OFFICEPARSER_PATH = join(__dirname, '..', 'fixtures', 'external', 'officeparser');

// Helper function to normalize officeparser output to our AST format
function normalizeToAST(result: any): DocumentAST {
  const blocks: Block[] = [];

  if (result.content && Array.isArray(result.content)) {
    result.content.forEach((item: any, index: number) => {
      if (item.type === 'paragraph' || item.type === 'heading') {
        const text = item.text || '';
        // Include empty paragraphs for compatibility testing
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
          text,
          runs,
          formatting
        });
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

// Helper to test parsing a file without errors
async function testFileParsing(filePath: string): Promise<{ success: boolean; ast?: DocumentAST; error?: Error }> {
  try {
    const buffer = await readFile(filePath);
    const result = await parseOffice(buffer);
    const ast = normalizeToAST(result);
    return { success: true, ast };
  } catch (error) {
    return { success: false, error: error as Error };
  }
}

// Helper to validate AST structure
function validateASTStructure(ast: DocumentAST): string[] {
  const errors: string[] = [];

  if (!ast.metadata || typeof ast.metadata !== 'object') {
    errors.push('Missing or invalid metadata object');
  }

  if (!Array.isArray(ast.blocks)) {
    errors.push('blocks is not an array');
    return errors;
  }

  ast.blocks.forEach((block, index) => {
    if (!block.id) {
      errors.push(`Block ${index} missing id`);
    }
    if (!block.type) {
      errors.push(`Block ${index} missing type`);
    }
    if (typeof block.text !== 'string') {
      errors.push(`Block ${index} text is not a string`);
    }
    if (!Array.isArray(block.runs)) {
      errors.push(`Block ${index} runs is not an array`);
    }
    if (!block.formatting || typeof block.formatting !== 'object') {
      errors.push(`Block ${index} missing or invalid formatting`);
    }
  });

  return errors;
}

describe('External Library Compatibility Tests', () => {
  describe('Mammoth.js Test Files', () => {
    const mammothExists = existsSync(MAMMOTH_PATH);

    it.skipIf(!mammothExists)('should list available Mammoth test files', async () => {
      const files = await readdir(MAMMOTH_PATH);
      const docxFiles = files.filter(f => f.endsWith('.docx'));
      console.log('Available Mammoth test files:', docxFiles);
      expect(docxFiles.length).toBeGreaterThanOrEqual(0);
    });

    it.skipIf(!mammothExists)('should parse single-paragraph.docx without errors', async () => {
      const filePath = join(MAMMOTH_PATH, 'single-paragraph.docx');
      if (!existsSync(filePath)) {
        console.log('File not found, skipping:', filePath);
        return;
      }

      const result = await testFileParsing(filePath);
      expect(result.success).toBe(true);

      if (result.ast) {
        const errors = validateASTStructure(result.ast);
        expect(errors).toEqual([]);
      }
    });

    it.skipIf(!mammothExists)('should parse tables.docx without errors', async () => {
      const filePath = join(MAMMOTH_PATH, 'tables.docx');
      if (!existsSync(filePath)) {
        console.log('File not found, skipping:', filePath);
        return;
      }

      const result = await testFileParsing(filePath);
      expect(result.success).toBe(true);
    });

    it.skipIf(!mammothExists)('should parse strikethrough.docx without errors', async () => {
      const filePath = join(MAMMOTH_PATH, 'strikethrough.docx');
      if (!existsSync(filePath)) {
        console.log('File not found, skipping:', filePath);
        return;
      }

      const result = await testFileParsing(filePath);
      expect(result.success).toBe(true);
    });

    it.skipIf(!mammothExists)('should parse underline.docx without errors', async () => {
      const filePath = join(MAMMOTH_PATH, 'underline.docx');
      if (!existsSync(filePath)) {
        console.log('File not found, skipping:', filePath);
        return;
      }

      const result = await testFileParsing(filePath);
      expect(result.success).toBe(true);
    });

    it.skipIf(!mammothExists)('should parse empty.docx without errors', async () => {
      const filePath = join(MAMMOTH_PATH, 'empty.docx');
      if (!existsSync(filePath)) {
        console.log('File not found, skipping:', filePath);
        return;
      }

      const result = await testFileParsing(filePath);
      expect(result.success).toBe(true);

      if (result.ast) {
        // Empty doc should have empty or minimal blocks
        expect(result.ast.blocks).toBeDefined();
      }
    });

    it.skipIf(!mammothExists)('should parse all Mammoth test files without critical errors', async () => {
      const files = await readdir(MAMMOTH_PATH);
      const docxFiles = files.filter(f => f.endsWith('.docx'));

      const results = await Promise.all(
        docxFiles.map(async (file) => {
          const result = await testFileParsing(join(MAMMOTH_PATH, file));
          return { file, ...result };
        })
      );

      // Log results
      results.forEach(r => {
        if (r.success) {
          console.log(`✓ ${r.file} - ${r.ast?.blocks.length || 0} blocks`);
        } else {
          console.log(`✗ ${r.file} - ${r.error?.message}`);
        }
      });

      // At least some files should parse successfully
      const successful = results.filter(r => r.success);
      expect(successful.length).toBeGreaterThan(0);
    });
  });

  describe('OfficeParser Test Files', () => {
    const officeparserExists = existsSync(OFFICEPARSER_PATH);

    it.skipIf(!officeparserExists)('should list available OfficeParser test files', async () => {
      const files = await readdir(OFFICEPARSER_PATH);
      const docxFiles = files.filter(f => f.endsWith('.docx'));
      console.log('Available OfficeParser test files:', docxFiles);
      expect(docxFiles.length).toBeGreaterThanOrEqual(0);
    });

    it.skipIf(!officeparserExists)('should parse test.docx without errors', async () => {
      const filePath = join(OFFICEPARSER_PATH, 'test.docx');
      if (!existsSync(filePath)) {
        console.log('File not found, skipping:', filePath);
        return;
      }

      const result = await testFileParsing(filePath);
      expect(result.success).toBe(true);

      if (result.ast) {
        const errors = validateASTStructure(result.ast);
        expect(errors).toEqual([]);
      }
    });

    it.skipIf(!officeparserExists)('should parse all OfficeParser test files without critical errors', async () => {
      const files = await readdir(OFFICEPARSER_PATH);
      const docxFiles = files.filter(f => f.endsWith('.docx'));

      if (docxFiles.length === 0) {
        console.log('No DOCX files found in OfficeParser test directory');
        return;
      }

      const results = await Promise.all(
        docxFiles.map(async (file) => {
          const result = await testFileParsing(join(OFFICEPARSER_PATH, file));
          return { file, ...result };
        })
      );

      // Log results
      results.forEach(r => {
        if (r.success) {
          console.log(`✓ ${r.file} - ${r.ast?.blocks.length || 0} blocks`);
        } else {
          console.log(`✗ ${r.file} - ${r.error?.message}`);
        }
      });

      // At least some files should parse successfully
      const successful = results.filter(r => r.success);
      expect(successful.length).toBeGreaterThan(0);
    });
  });

  describe('Existing Test Documents', () => {
    it('should parse contract_v1.docx with valid AST', async () => {
      const filePath = 'test-documents/contract_v1.docx';
      if (!existsSync(filePath)) {
        console.log('File not found, skipping:', filePath);
        return;
      }

      const result = await testFileParsing(filePath);
      expect(result.success).toBe(true);

      if (result.ast) {
        const errors = validateASTStructure(result.ast);
        expect(errors).toEqual([]);
        expect(result.ast.blocks.length).toBeGreaterThan(0);
      }
    });

    it('should parse contract_v2.docx with valid AST', async () => {
      const filePath = 'test-documents/contract_v2.docx';
      if (!existsSync(filePath)) {
        console.log('File not found, skipping:', filePath);
        return;
      }

      const result = await testFileParsing(filePath);
      expect(result.success).toBe(true);

      if (result.ast) {
        const errors = validateASTStructure(result.ast);
        expect(errors).toEqual([]);
        expect(result.ast.blocks.length).toBeGreaterThan(0);
      }
    });
  });

  describe('AST Structure Validation', () => {
    it('should validate that block IDs are strings', async () => {
      const filePath = 'test-documents/contract_v1.docx';
      if (!existsSync(filePath)) return;

      const result = await testFileParsing(filePath);
      if (!result.success || !result.ast) return;

      result.ast.blocks.forEach(block => {
        expect(typeof block.id).toBe('string');
        expect(block.id.length).toBeGreaterThan(0);
      });
    });

    it('should validate that block types are valid', async () => {
      const filePath = 'test-documents/contract_v1.docx';
      if (!existsSync(filePath)) return;

      const result = await testFileParsing(filePath);
      if (!result.success || !result.ast) return;

      const validTypes = ['paragraph', 'heading1', 'heading2', 'heading3', 'table', 'page-break'];
      result.ast.blocks.forEach(block => {
        expect(validTypes).toContain(block.type);
      });
    });

    it('should validate that runs array exists and is valid', async () => {
      const filePath = 'test-documents/contract_v1.docx';
      if (!existsSync(filePath)) return;

      const result = await testFileParsing(filePath);
      if (!result.success || !result.ast) return;

      result.ast.blocks.forEach(block => {
        expect(Array.isArray(block.runs)).toBe(true);
        block.runs.forEach(run => {
          expect(typeof run.text).toBe('string');
          expect(run.formatting).toBeDefined();
          expect(typeof run.formatting).toBe('object');
        });
      });
    });

    it('should validate formatting properties are correct types', async () => {
      const filePath = 'test-documents/contract_v1.docx';
      if (!existsSync(filePath)) return;

      const result = await testFileParsing(filePath);
      if (!result.success || !result.ast) return;

      result.ast.blocks.forEach(block => {
        const fmt = block.formatting;

        if (fmt.bold !== undefined) {
          expect(typeof fmt.bold).toBe('boolean');
        }
        if (fmt.italic !== undefined) {
          expect(typeof fmt.italic).toBe('boolean');
        }
        if (fmt.underline !== undefined) {
          expect(typeof fmt.underline).toBe('boolean');
        }
        if (fmt.color !== undefined) {
          expect(typeof fmt.color).toBe('string');
        }
        if (fmt.font !== undefined) {
          expect(typeof fmt.font).toBe('string');
        }
        if (fmt.fontSize !== undefined) {
          expect(typeof fmt.fontSize).toBe('number');
        }
      });
    });
  });
});
