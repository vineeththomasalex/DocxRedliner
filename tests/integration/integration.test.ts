import { describe, it, expect } from 'vitest';
import { readFile } from 'fs/promises';
import { parseOffice } from 'officeparser';
import { DiffEngine } from '../../src/diff/diff-engine';
import type { DocumentAST, Block, TextRun, TextFormatting } from '../../src/types/ast.types';

// Helper function to normalize officeparser output to our AST format
function normalizeToAST(result: any): DocumentAST {
  const blocks: Block[] = [];

  // Extract blocks from parsed result
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
            text,
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

describe('DOCX Document Comparison Integration Tests', () => {
  it('should parse contract_v1.docx without errors', async () => {
    const buffer = await readFile('test-documents/contract_v1.docx');
    const result = await parseOffice(buffer);

    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
  });

  it('should parse contract_v2.docx without errors', async () => {
    const buffer = await readFile('test-documents/contract_v2.docx');
    const result = await parseOffice(buffer);

    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
  });

  it('should extract text from both documents', async () => {
    const buffer1 = await readFile('test-documents/contract_v1.docx');
    const buffer2 = await readFile('test-documents/contract_v2.docx');

    const result1 = await parseOffice(buffer1);
    const result2 = await parseOffice(buffer2);

    const ast1 = normalizeToAST(result1);
    const ast2 = normalizeToAST(result2);

    expect(ast1.blocks.length).toBeGreaterThan(0);
    expect(ast2.blocks.length).toBeGreaterThan(0);

    console.log(`\nDocument 1 has ${ast1.blocks.length} blocks`);
    console.log(`Document 2 has ${ast2.blocks.length} blocks`);
  });

  it('should detect differences between contract versions', async () => {
    const buffer1 = await readFile('test-documents/contract_v1.docx');
    const buffer2 = await readFile('test-documents/contract_v2.docx');

    const result1 = await parseOffice(buffer1);
    const result2 = await parseOffice(buffer2);

    const ast1 = normalizeToAST(result1);
    const ast2 = normalizeToAST(result2);

    const diffEngine = new DiffEngine();
    const diff = diffEngine.diffDocuments(ast1, ast2);

    expect(diff).toBeDefined();
    expect(diff.blockDiffs).toBeDefined();
    expect(diff.totalChanges).toBeGreaterThan(0);

    console.log(`\nTotal changes detected: ${diff.totalChanges}`);

    // Count different types of changes
    const insertions = diff.blockDiffs.filter(d => d.type === 'insert').length;
    const deletions = diff.blockDiffs.filter(d => d.type === 'delete').length;
    const modifications = diff.blockDiffs.filter(d => d.type === 'modify').length;
    const unchanged = diff.blockDiffs.filter(d => d.type === 'unchanged').length;

    console.log(`  - Insertions: ${insertions}`);
    console.log(`  - Deletions: ${deletions}`);
    console.log(`  - Modifications: ${modifications}`);
    console.log(`  - Unchanged: ${unchanged}`);

    // Verify we have at least some changes
    expect(insertions + deletions + modifications).toBeGreaterThan(0);
  });

  it('should detect specific expected changes', async () => {
    const buffer1 = await readFile('test-documents/contract_v1.docx');
    const buffer2 = await readFile('test-documents/contract_v2.docx');

    const result1 = await parseOffice(buffer1);
    const result2 = await parseOffice(buffer2);

    const ast1 = normalizeToAST(result1);
    const ast2 = normalizeToAST(result2);

    // Log sample text from both documents
    console.log('\nSample text from Document 1:');
    ast1.blocks.slice(0, 3).forEach((block, i) => {
      console.log(`  Block ${i}: "${block.text.substring(0, 60)}..."`);
    });

    console.log('\nSample text from Document 2:');
    ast2.blocks.slice(0, 3).forEach((block, i) => {
      console.log(`  Block ${i}: "${block.text.substring(0, 60)}..."`);
    });

    const diffEngine = new DiffEngine();
    const diff = diffEngine.diffDocuments(ast1, ast2);

    // Log the first few changes
    console.log('\nFirst 5 changes detected:');
    diff.blockDiffs
      .filter(d => d.type !== 'unchanged')
      .slice(0, 5)
      .forEach((d, i) => {
        console.log(`  ${i + 1}. Type: ${d.type}`);
        if (d.type === 'modify' && d.originalBlock && d.currentBlock) {
          console.log(`     Original: "${d.originalBlock.text.substring(0, 40)}..."`);
          console.log(`     Current:  "${d.currentBlock.text.substring(0, 40)}..."`);
        } else if (d.type === 'insert' && d.currentBlock) {
          console.log(`     Inserted: "${d.currentBlock.text.substring(0, 40)}..."`);
        } else if (d.type === 'delete' && d.originalBlock) {
          console.log(`     Deleted:  "${d.originalBlock.text.substring(0, 40)}..."`);
        }
      });

    // Basic assertions - at least some changes should be detected
    expect(diff.totalChanges).toBeGreaterThanOrEqual(1);
  });
});

describe('Diff Engine Unit Tests', () => {
  it('should detect text insertions', () => {
    const diffEngine = new DiffEngine();

    const ast1: DocumentAST = {
      metadata: {},
      blocks: [
        {
          id: 'b1',
          type: 'paragraph',
          text: 'Hello world',
          runs: [{ text: 'Hello world', formatting: {} }],
          formatting: {}
        }
      ]
    };

    const ast2: DocumentAST = {
      metadata: {},
      blocks: [
        {
          id: 'b1',
          type: 'paragraph',
          text: 'Hello beautiful world',
          runs: [{ text: 'Hello beautiful world', formatting: {} }],
          formatting: {}
        }
      ]
    };

    const diff = diffEngine.diffDocuments(ast1, ast2);

    expect(diff.totalChanges).toBeGreaterThan(0);
    expect(diff.blockDiffs[0].type).toBe('modify');
    expect(diff.blockDiffs[0].wordDiff).toBeDefined();
  });

  it('should detect text deletions', () => {
    const diffEngine = new DiffEngine();

    const ast1: DocumentAST = {
      metadata: {},
      blocks: [
        {
          id: 'b1',
          type: 'paragraph',
          text: 'Hello beautiful world',
          runs: [{ text: 'Hello beautiful world', formatting: {} }],
          formatting: {}
        }
      ]
    };

    const ast2: DocumentAST = {
      metadata: {},
      blocks: [
        {
          id: 'b1',
          type: 'paragraph',
          text: 'Hello world',
          runs: [{ text: 'Hello world', formatting: {} }],
          formatting: {}
        }
      ]
    };

    const diff = diffEngine.diffDocuments(ast1, ast2);

    expect(diff.totalChanges).toBeGreaterThan(0);
    expect(diff.blockDiffs[0].type).toBe('modify');
  });

  it('should detect block insertions', () => {
    const diffEngine = new DiffEngine();

    const ast1: DocumentAST = {
      metadata: {},
      blocks: [
        {
          id: 'b1',
          type: 'paragraph',
          text: 'First paragraph',
          runs: [{ text: 'First paragraph', formatting: {} }],
          formatting: {}
        }
      ]
    };

    const ast2: DocumentAST = {
      metadata: {},
      blocks: [
        {
          id: 'b1',
          type: 'paragraph',
          text: 'First paragraph',
          runs: [{ text: 'First paragraph', formatting: {} }],
          formatting: {}
        },
        {
          id: 'b2',
          type: 'paragraph',
          text: 'Second paragraph',
          runs: [{ text: 'Second paragraph', formatting: {} }],
          formatting: {}
        }
      ]
    };

    const diff = diffEngine.diffDocuments(ast1, ast2);

    const insertions = diff.blockDiffs.filter(d => d.type === 'insert');
    expect(insertions.length).toBeGreaterThan(0);
  });

  it('should detect formatting changes', () => {
    const diffEngine = new DiffEngine();

    const ast1: DocumentAST = {
      metadata: {},
      blocks: [
        {
          id: 'b1',
          type: 'paragraph',
          text: 'Important text',
          runs: [{ text: 'Important text', formatting: {} }],
          formatting: {}
        }
      ]
    };

    const ast2: DocumentAST = {
      metadata: {},
      blocks: [
        {
          id: 'b1',
          type: 'paragraph',
          text: 'Important text',
          runs: [{ text: 'Important text', formatting: { bold: true } }],
          formatting: { bold: true }
        }
      ]
    };

    const diff = diffEngine.diffDocuments(ast1, ast2);

    expect(diff.totalChanges).toBeGreaterThan(0);
  });
});
