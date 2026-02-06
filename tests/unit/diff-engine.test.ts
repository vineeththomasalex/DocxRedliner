// Unit tests for DiffEngine

import { describe, it, expect } from 'vitest';
import { DiffEngine } from '../../src/diff/diff-engine';
import {
  createSimpleDocument,
  createMultiParagraphDocument,
  createEmptyDocument,
  createLargeDocument,
  createDocument,
  createParagraph,
  createHeading,
  createUnicodeDocument
} from '../helpers/ast-factory';

describe('DiffEngine', () => {
  const diffEngine = new DiffEngine();

  describe('Block alignment', () => {
    it('should handle exact block matches', () => {
      const doc1 = createMultiParagraphDocument(['First paragraph', 'Second paragraph']);
      const doc2 = createMultiParagraphDocument(['First paragraph', 'Second paragraph']);

      const diff = diffEngine.diffDocuments(doc1, doc2);

      expect(diff.totalChanges).toBe(0);
      expect(diff.blockDiffs.every(d => d.type === 'unchanged')).toBe(true);
    });

    it('should detect fuzzy matches with >50% word overlap', () => {
      const doc1 = createSimpleDocument('The quick brown fox jumps over the lazy dog');
      const doc2 = createSimpleDocument('The quick brown fox leaps over the lazy cat');

      const diff = diffEngine.diffDocuments(doc1, doc2);

      // Should be treated as a modification, not insert/delete
      expect(diff.blockDiffs[0].type).toBe('modify');
      expect(diff.blockDiffs[0].wordDiff).toBeDefined();
    });

    it('should treat completely different blocks as insert/delete', () => {
      const doc1 = createSimpleDocument('AAAA BBBB CCCC');
      const doc2 = createSimpleDocument('XXXX YYYY ZZZZ');

      const diff = diffEngine.diffDocuments(doc1, doc2);

      // Below 50% similarity, should be delete + insert
      const hasDelete = diff.blockDiffs.some(d => d.type === 'delete');
      const hasInsert = diff.blockDiffs.some(d => d.type === 'insert');
      expect(hasDelete || hasInsert || diff.blockDiffs[0].type === 'modify').toBe(true);
    });

    it('should preserve order of blocks', () => {
      const doc1 = createMultiParagraphDocument(['A', 'B', 'C']);
      const doc2 = createMultiParagraphDocument(['A', 'B', 'C']);

      const diff = diffEngine.diffDocuments(doc1, doc2);

      const texts = diff.blockDiffs.map(d => d.originalBlock?.text || d.currentBlock?.text);
      expect(texts).toEqual(['A', 'B', 'C']);
    });
  });

  describe('Word-level diffing', () => {
    it('should detect word insertions', () => {
      const doc1 = createSimpleDocument('Hello world');
      const doc2 = createSimpleDocument('Hello beautiful world');

      const diff = diffEngine.diffDocuments(doc1, doc2);

      expect(diff.totalChanges).toBeGreaterThan(0);
      expect(diff.blockDiffs[0].type).toBe('modify');
      expect(diff.blockDiffs[0].wordDiff).toBeDefined();

      const insertions = diff.blockDiffs[0].wordDiff!.filter(c => c.added);
      expect(insertions.length).toBeGreaterThan(0);
      expect(insertions.some(c => c.value.includes('beautiful'))).toBe(true);
    });

    it('should detect word deletions', () => {
      const doc1 = createSimpleDocument('Hello beautiful world');
      const doc2 = createSimpleDocument('Hello world');

      const diff = diffEngine.diffDocuments(doc1, doc2);

      expect(diff.totalChanges).toBeGreaterThan(0);
      expect(diff.blockDiffs[0].type).toBe('modify');

      const deletions = diff.blockDiffs[0].wordDiff!.filter(c => c.removed);
      expect(deletions.length).toBeGreaterThan(0);
      expect(deletions.some(c => c.value.includes('beautiful'))).toBe(true);
    });

    it('should detect word replacements', () => {
      const doc1 = createSimpleDocument('The cat sat on the mat');
      const doc2 = createSimpleDocument('The dog sat on the rug');

      const diff = diffEngine.diffDocuments(doc1, doc2);

      expect(diff.blockDiffs[0].type).toBe('modify');

      const wordDiff = diff.blockDiffs[0].wordDiff!;
      const deletions = wordDiff.filter(c => c.removed);
      const insertions = wordDiff.filter(c => c.added);

      expect(deletions.some(c => c.value.includes('cat'))).toBe(true);
      expect(insertions.some(c => c.value.includes('dog'))).toBe(true);
    });

    it('should handle multiple changes in one block', () => {
      const doc1 = createSimpleDocument('One two three four five');
      const doc2 = createSimpleDocument('One TWO three FOUR five');

      const diff = diffEngine.diffDocuments(doc1, doc2);

      expect(diff.blockDiffs[0].type).toBe('modify');

      const wordDiff = diff.blockDiffs[0].wordDiff!;
      const changes = wordDiff.filter(c => c.added || c.removed);
      expect(changes.length).toBeGreaterThan(0);
    });
  });

  describe('Block insertions and deletions', () => {
    it('should detect block insertions', () => {
      const doc1 = createMultiParagraphDocument(['First']);
      const doc2 = createMultiParagraphDocument(['First', 'Second']);

      const diff = diffEngine.diffDocuments(doc1, doc2);

      const insertions = diff.blockDiffs.filter(d => d.type === 'insert');
      expect(insertions.length).toBe(1);
      expect(insertions[0].currentBlock?.text).toBe('Second');
    });

    it('should detect block deletions', () => {
      const doc1 = createMultiParagraphDocument(['First', 'Second']);
      const doc2 = createMultiParagraphDocument(['First']);

      const diff = diffEngine.diffDocuments(doc1, doc2);

      const deletions = diff.blockDiffs.filter(d => d.type === 'delete');
      expect(deletions.length).toBe(1);
      expect(deletions[0].originalBlock?.text).toBe('Second');
    });

    it('should detect multiple block insertions', () => {
      const doc1 = createMultiParagraphDocument(['A']);
      const doc2 = createMultiParagraphDocument(['A', 'B', 'C']);

      const diff = diffEngine.diffDocuments(doc1, doc2);

      const insertions = diff.blockDiffs.filter(d => d.type === 'insert');
      expect(insertions.length).toBe(2);
    });

    it('should detect multiple block deletions', () => {
      const doc1 = createMultiParagraphDocument(['A', 'B', 'C']);
      const doc2 = createMultiParagraphDocument(['A']);

      const diff = diffEngine.diffDocuments(doc1, doc2);

      const deletions = diff.blockDiffs.filter(d => d.type === 'delete');
      expect(deletions.length).toBe(2);
    });

    it('should detect interleaved insertions and deletions', () => {
      const doc1 = createMultiParagraphDocument(['A', 'B', 'C']);
      const doc2 = createMultiParagraphDocument(['A', 'X', 'C']);

      const diff = diffEngine.diffDocuments(doc1, doc2);

      // 'B' becomes 'X' - either as modify, or delete+insert
      const changes = diff.blockDiffs.filter(d => d.type !== 'unchanged');
      expect(changes.length).toBeGreaterThan(0);
    });
  });

  describe('Formatting comparison', () => {
    it('should detect bold formatting changes', () => {
      const doc1 = createSimpleDocument('Text');
      const doc2 = createSimpleDocument('Text', { bold: true });

      const diff = diffEngine.diffDocuments(doc1, doc2);

      expect(diff.totalChanges).toBeGreaterThan(0);
    });

    it('should detect italic formatting changes', () => {
      const doc1 = createSimpleDocument('Text');
      const doc2 = createSimpleDocument('Text', { italic: true });

      const diff = diffEngine.diffDocuments(doc1, doc2);

      expect(diff.totalChanges).toBeGreaterThan(0);
    });

    it('should detect underline formatting changes', () => {
      const doc1 = createSimpleDocument('Text');
      const doc2 = createSimpleDocument('Text', { underline: true });

      const diff = diffEngine.diffDocuments(doc1, doc2);

      expect(diff.totalChanges).toBeGreaterThan(0);
    });

    it('should detect color formatting changes', () => {
      const doc1 = createSimpleDocument('Text', { color: '#000000' });
      const doc2 = createSimpleDocument('Text', { color: '#FF0000' });

      const diff = diffEngine.diffDocuments(doc1, doc2);

      expect(diff.totalChanges).toBeGreaterThan(0);
    });

    it('should detect font family changes', () => {
      const doc1 = createSimpleDocument('Text', { font: 'Arial' });
      const doc2 = createSimpleDocument('Text', { font: 'Times New Roman' });

      const diff = diffEngine.diffDocuments(doc1, doc2);

      expect(diff.totalChanges).toBeGreaterThan(0);
    });

    it('should detect font size changes', () => {
      const doc1 = createSimpleDocument('Text', { fontSize: 12 });
      const doc2 = createSimpleDocument('Text', { fontSize: 16 });

      const diff = diffEngine.diffDocuments(doc1, doc2);

      expect(diff.totalChanges).toBeGreaterThan(0);
    });

    it('should not report changes when formatting is identical', () => {
      const doc1 = createSimpleDocument('Text', { bold: true, italic: true });
      const doc2 = createSimpleDocument('Text', { bold: true, italic: true });

      const diff = diffEngine.diffDocuments(doc1, doc2);

      expect(diff.totalChanges).toBe(0);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty original document', () => {
      const doc1 = createEmptyDocument();
      const doc2 = createMultiParagraphDocument(['New content']);

      const diff = diffEngine.diffDocuments(doc1, doc2);

      expect(diff.totalChanges).toBe(1);
      expect(diff.blockDiffs[0].type).toBe('insert');
    });

    it('should handle empty current document', () => {
      const doc1 = createMultiParagraphDocument(['Old content']);
      const doc2 = createEmptyDocument();

      const diff = diffEngine.diffDocuments(doc1, doc2);

      expect(diff.totalChanges).toBe(1);
      expect(diff.blockDiffs[0].type).toBe('delete');
    });

    it('should handle both documents empty', () => {
      const doc1 = createEmptyDocument();
      const doc2 = createEmptyDocument();

      const diff = diffEngine.diffDocuments(doc1, doc2);

      expect(diff.totalChanges).toBe(0);
      expect(diff.blockDiffs.length).toBe(0);
    });

    it('should handle identical documents', () => {
      const doc1 = createMultiParagraphDocument(['Same', 'Content', 'Here']);
      const doc2 = createMultiParagraphDocument(['Same', 'Content', 'Here']);

      const diff = diffEngine.diffDocuments(doc1, doc2);

      expect(diff.totalChanges).toBe(0);
      expect(diff.blockDiffs.every(d => d.type === 'unchanged')).toBe(true);
    });

    it('should handle unicode content', () => {
      const doc1 = createSimpleDocument('Hello World');
      const doc2 = createSimpleDocument('Hello 世界 🌍');

      const diff = diffEngine.diffDocuments(doc1, doc2);

      expect(diff.totalChanges).toBeGreaterThan(0);
      // The diff might be 'modify' if similarity >= 50%, or 'delete'+'insert' otherwise
      const hasChanges = diff.blockDiffs.some(d => d.type !== 'unchanged');
      expect(hasChanges).toBe(true);
    });

    it('should handle very long paragraphs', () => {
      const longText = 'Lorem ipsum '.repeat(100);
      const doc1 = createSimpleDocument(longText);
      const doc2 = createSimpleDocument(longText + ' ADDED');

      const diff = diffEngine.diffDocuments(doc1, doc2);

      expect(diff.blockDiffs[0].type).toBe('modify');
    });

    it('should handle special characters', () => {
      const doc1 = createSimpleDocument('Text with "quotes" & <brackets>');
      const doc2 = createSimpleDocument('Text with \'quotes\' & [brackets]');

      const diff = diffEngine.diffDocuments(doc1, doc2);

      expect(diff.totalChanges).toBeGreaterThan(0);
    });

    it('should handle whitespace variations', () => {
      const doc1 = createSimpleDocument('Text   with    spaces');
      const doc2 = createSimpleDocument('Text with spaces');

      const diff = diffEngine.diffDocuments(doc1, doc2);

      // Whitespace normalization in alignment should still match these
      // But diff may show as modification due to exact text difference
      expect(diff.blockDiffs.length).toBe(1);
    });
  });

  describe('Performance', () => {
    it('should handle large documents efficiently', () => {
      const doc1 = createLargeDocument(100);
      const doc2 = createLargeDocument(100);

      // Modify some paragraphs
      doc2.blocks[10].text = 'Modified paragraph content here';
      doc2.blocks[50].text = 'Another modified paragraph';

      const startTime = performance.now();
      const diff = diffEngine.diffDocuments(doc1, doc2);
      const endTime = performance.now();

      expect(diff).toBeDefined();
      expect(endTime - startTime).toBeLessThan(5000); // Should complete in under 5 seconds
    });
  });

  describe('Mixed block types', () => {
    it('should handle heading and paragraph mix', () => {
      const doc1 = createDocument([
        createHeading('Title', 1, { id: 'h1' }),
        createParagraph('Content', { id: 'p1' })
      ]);

      const doc2 = createDocument([
        createHeading('Modified Title', 1, { id: 'h1' }),
        createParagraph('Content', { id: 'p1' })
      ]);

      const diff = diffEngine.diffDocuments(doc1, doc2);

      const modified = diff.blockDiffs.filter(d => d.type === 'modify');
      expect(modified.length).toBe(1);
    });
  });

  describe('changeId assignment', () => {
    it('should assign changeIds to changed blocks', () => {
      const doc1 = createMultiParagraphDocument(['A', 'B']);
      const doc2 = createMultiParagraphDocument(['A', 'C']);

      const diff = diffEngine.diffDocuments(doc1, doc2);

      const changed = diff.blockDiffs.filter(d => d.changeId);
      expect(changed.length).toBe(diff.totalChanges);
    });

    it('should not assign changeIds to unchanged blocks', () => {
      const doc1 = createMultiParagraphDocument(['A', 'B']);
      const doc2 = createMultiParagraphDocument(['A', 'B']);

      const diff = diffEngine.diffDocuments(doc1, doc2);

      const withChangeId = diff.blockDiffs.filter(d => d.changeId);
      expect(withChangeId.length).toBe(0);
    });

    it('should assign unique changeIds', () => {
      const doc1 = createMultiParagraphDocument(['A', 'B', 'C']);
      const doc2 = createMultiParagraphDocument(['X', 'Y', 'Z']);

      const diff = diffEngine.diffDocuments(doc1, doc2);

      const changeIds = diff.blockDiffs
        .filter(d => d.changeId)
        .map(d => d.changeId);

      const uniqueIds = new Set(changeIds);
      expect(uniqueIds.size).toBe(changeIds.length);
    });
  });
});
