// End-to-End Integration Tests
// Tests full workflow: parse -> diff -> render

import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { parseOffice } from 'officeparser';
import { DiffEngine } from '../../src/diff/diff-engine';
import type { DocumentAST, Block, TextRun, TextFormatting } from '../../src/types/ast.types';

// Path to synthetic test documents
const SYNTHETIC_DOCS_PATH = join(__dirname, '..', 'fixtures', 'synthetic', 'docs');

// Helper function to normalize officeparser output to our AST format
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

// Helper to load and parse a DOCX file
async function loadAndParse(filePath: string): Promise<DocumentAST> {
  const buffer = await readFile(filePath);
  const result = await parseOffice(buffer);
  return normalizeToAST(result);
}

describe('End-to-End Integration Tests', () => {
  const diffEngine = new DiffEngine();

  describe('Synthetic Document Tests', () => {
    // Check if synthetic docs exist
    const syntheticDocsExist = existsSync(SYNTHETIC_DOCS_PATH);

    it.skipIf(!syntheticDocsExist)('should detect word insertions (scenario 01)', async () => {
      const original = await loadAndParse(join(SYNTHETIC_DOCS_PATH, '01-word-insertion_original.docx'));
      const modified = await loadAndParse(join(SYNTHETIC_DOCS_PATH, '01-word-insertion_modified.docx'));

      const diff = diffEngine.diffDocuments(original, modified);

      expect(diff.totalChanges).toBeGreaterThan(0);

      const modifications = diff.blockDiffs.filter(d => d.type === 'modify');
      expect(modifications.length).toBeGreaterThan(0);

      // Should have word-level diff showing insertion
      const wordDiff = modifications[0].wordDiff;
      expect(wordDiff).toBeDefined();

      const insertions = wordDiff!.filter(c => c.added);
      expect(insertions.length).toBeGreaterThan(0);
    });

    it.skipIf(!syntheticDocsExist)('should detect word deletions (scenario 02)', async () => {
      const original = await loadAndParse(join(SYNTHETIC_DOCS_PATH, '02-word-deletion_original.docx'));
      const modified = await loadAndParse(join(SYNTHETIC_DOCS_PATH, '02-word-deletion_modified.docx'));

      const diff = diffEngine.diffDocuments(original, modified);

      expect(diff.totalChanges).toBeGreaterThan(0);

      const modifications = diff.blockDiffs.filter(d => d.type === 'modify');
      expect(modifications.length).toBeGreaterThan(0);

      const wordDiff = modifications[0].wordDiff;
      expect(wordDiff).toBeDefined();

      const deletions = wordDiff!.filter(c => c.removed);
      expect(deletions.length).toBeGreaterThan(0);
    });

    it.skipIf(!syntheticDocsExist)('should detect paragraph additions (scenario 03)', async () => {
      const original = await loadAndParse(join(SYNTHETIC_DOCS_PATH, '03-paragraph-added_original.docx'));
      const modified = await loadAndParse(join(SYNTHETIC_DOCS_PATH, '03-paragraph-added_modified.docx'));

      const diff = diffEngine.diffDocuments(original, modified);

      const insertions = diff.blockDiffs.filter(d => d.type === 'insert');
      expect(insertions.length).toBeGreaterThan(0);
    });

    it.skipIf(!syntheticDocsExist)('should detect paragraph removals (scenario 04)', async () => {
      const original = await loadAndParse(join(SYNTHETIC_DOCS_PATH, '04-paragraph-removed_original.docx'));
      const modified = await loadAndParse(join(SYNTHETIC_DOCS_PATH, '04-paragraph-removed_modified.docx'));

      const diff = diffEngine.diffDocuments(original, modified);

      const deletions = diff.blockDiffs.filter(d => d.type === 'delete');
      expect(deletions.length).toBeGreaterThan(0);
    });

    it.skipIf(!syntheticDocsExist)('should report zero changes for identical docs (scenario 08)', async () => {
      const original = await loadAndParse(join(SYNTHETIC_DOCS_PATH, '08-identical_original.docx'));
      const modified = await loadAndParse(join(SYNTHETIC_DOCS_PATH, '08-identical_modified.docx'));

      const diff = diffEngine.diffDocuments(original, modified);

      expect(diff.totalChanges).toBe(0);
      expect(diff.blockDiffs.every(d => d.type === 'unchanged')).toBe(true);
    });

    it.skipIf(!syntheticDocsExist)('should handle empty to content (scenario 09)', async () => {
      const original = await loadAndParse(join(SYNTHETIC_DOCS_PATH, '09-empty-to-content_original.docx'));
      const modified = await loadAndParse(join(SYNTHETIC_DOCS_PATH, '09-empty-to-content_modified.docx'));

      const diff = diffEngine.diffDocuments(original, modified);

      expect(diff.totalChanges).toBeGreaterThan(0);

      const insertions = diff.blockDiffs.filter(d => d.type === 'insert');
      expect(insertions.length).toBeGreaterThan(0);
    });

    it.skipIf(!syntheticDocsExist)('should handle unicode content (scenario 10)', async () => {
      const original = await loadAndParse(join(SYNTHETIC_DOCS_PATH, '10-unicode_original.docx'));
      const modified = await loadAndParse(join(SYNTHETIC_DOCS_PATH, '10-unicode_modified.docx'));

      const diff = diffEngine.diffDocuments(original, modified);

      // Should not throw and should detect changes
      expect(diff).toBeDefined();
      expect(diff.totalChanges).toBeGreaterThan(0);
    });

    it.skipIf(!syntheticDocsExist)('should handle multiple changes (scenario 11)', async () => {
      const original = await loadAndParse(join(SYNTHETIC_DOCS_PATH, '11-multiple-changes_original.docx'));
      const modified = await loadAndParse(join(SYNTHETIC_DOCS_PATH, '11-multiple-changes_modified.docx'));

      const diff = diffEngine.diffDocuments(original, modified);

      // Should detect multiple types of changes
      expect(diff.totalChanges).toBeGreaterThan(1);
    });

    it.skipIf(!syntheticDocsExist)('should handle large documents efficiently (scenario 21)', async () => {
      const original = await loadAndParse(join(SYNTHETIC_DOCS_PATH, '21-large-document_original.docx'));
      const modified = await loadAndParse(join(SYNTHETIC_DOCS_PATH, '21-large-document_modified.docx'));

      const startTime = performance.now();
      const diff = diffEngine.diffDocuments(original, modified);
      const endTime = performance.now();

      expect(diff).toBeDefined();
      expect(endTime - startTime).toBeLessThan(5000); // Should complete in under 5 seconds
    });
  });

  describe('Real Document Tests (contract_v1 vs contract_v2)', () => {
    const contractDocsExist = existsSync('test-documents/contract_v1.docx') &&
                              existsSync('test-documents/contract_v2.docx');

    it.skipIf(!contractDocsExist)('should parse and diff contract documents', async () => {
      const original = await loadAndParse('test-documents/contract_v1.docx');
      const modified = await loadAndParse('test-documents/contract_v2.docx');

      expect(original.blocks.length).toBeGreaterThan(0);
      expect(modified.blocks.length).toBeGreaterThan(0);

      const diff = diffEngine.diffDocuments(original, modified);

      expect(diff).toBeDefined();
      expect(diff.blockDiffs).toBeDefined();
      expect(diff.totalChanges).toBeGreaterThan(0);
    });

    it.skipIf(!contractDocsExist)('should have valid block diffs', async () => {
      const original = await loadAndParse('test-documents/contract_v1.docx');
      const modified = await loadAndParse('test-documents/contract_v2.docx');

      const diff = diffEngine.diffDocuments(original, modified);

      // Every block diff should have correct structure
      diff.blockDiffs.forEach(blockDiff => {
        expect(['insert', 'delete', 'modify', 'unchanged']).toContain(blockDiff.type);

        if (blockDiff.type === 'insert') {
          expect(blockDiff.currentBlock).toBeDefined();
          expect(blockDiff.changeId).toBeDefined();
        }

        if (blockDiff.type === 'delete') {
          expect(blockDiff.originalBlock).toBeDefined();
          expect(blockDiff.changeId).toBeDefined();
        }

        if (blockDiff.type === 'modify') {
          expect(blockDiff.originalBlock).toBeDefined();
          expect(blockDiff.currentBlock).toBeDefined();
          expect(blockDiff.changeId).toBeDefined();
        }

        if (blockDiff.type === 'unchanged') {
          expect(blockDiff.originalBlock).toBeDefined();
          expect(blockDiff.currentBlock).toBeDefined();
          expect(blockDiff.changeId).toBeUndefined();
        }
      });
    });
  });

  describe('Full Pipeline Validation', () => {
    it('should maintain block order through diff pipeline', async () => {
      const contractExists = existsSync('test-documents/contract_v1.docx');
      if (!contractExists) {
        return; // Skip if no test documents
      }

      const original = await loadAndParse('test-documents/contract_v1.docx');
      const diff = diffEngine.diffDocuments(original, original);

      // When comparing identical docs, blocks should maintain order
      const originalTexts = original.blocks.map(b => b.text);
      const diffTexts = diff.blockDiffs.map(d => d.originalBlock?.text || d.currentBlock?.text);

      expect(diffTexts).toEqual(originalTexts);
    });

    it('should assign unique change IDs', async () => {
      const contractExists = existsSync('test-documents/contract_v1.docx') &&
                            existsSync('test-documents/contract_v2.docx');
      if (!contractExists) {
        return;
      }

      const original = await loadAndParse('test-documents/contract_v1.docx');
      const modified = await loadAndParse('test-documents/contract_v2.docx');

      const diff = diffEngine.diffDocuments(original, modified);

      const changeIds = diff.blockDiffs
        .filter(d => d.changeId)
        .map(d => d.changeId);

      const uniqueIds = new Set(changeIds);
      expect(uniqueIds.size).toBe(changeIds.length);
    });
  });
});
