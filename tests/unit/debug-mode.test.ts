// Unit tests for Debug Mode functionality

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DiffEngine } from '../../src/diff/diff-engine';
import { DebugExporter } from '../../src/ui/debug-export';
import {
  createSimpleDocument,
  createMultiParagraphDocument,
  createEmptyDocument,
  createLargeDocument,
  createDocument,
  createParagraph,
  createPageBreak
} from '../helpers/ast-factory';
import type { AlignmentDecision, DebugReport } from '../../src/types/debug.types';

describe('DiffEngine Debug Mode', () => {
  let diffEngine: DiffEngine;

  beforeEach(() => {
    diffEngine = new DiffEngine();
  });

  it('should return debug info when debug mode enabled', () => {
    diffEngine.setDebugMode(true);

    const doc1 = createSimpleDocument('Hello world');
    const doc2 = createSimpleDocument('Hello beautiful world');

    const result = diffEngine.diffDocumentsWithDebug(doc1, doc2);

    expect(result.alignmentDecisions).toBeDefined();
    expect(result.alignmentDecisions!.length).toBeGreaterThan(0);
  });

  it('should always return alignment decisions regardless of debug mode', () => {
    diffEngine.setDebugMode(false);

    const doc1 = createSimpleDocument('Hello world');
    const doc2 = createSimpleDocument('Hello beautiful world');

    const result = diffEngine.diffDocumentsWithDebug(doc1, doc2);

    // Decisions are always returned for debug export functionality
    expect(result.alignmentDecisions).toBeDefined();
    expect(result.alignmentDecisions.length).toBeGreaterThan(0);
  });

  it('should include similarity scores for fuzzy matches', () => {
    diffEngine.setDebugMode(true);

    const doc1 = createSimpleDocument('The quick brown fox jumps over the lazy dog');
    const doc2 = createSimpleDocument('The quick brown fox leaps over the lazy cat');

    const result = diffEngine.diffDocumentsWithDebug(doc1, doc2);

    const fuzzyDecisions = result.alignmentDecisions!.filter(d => d.matchType === 'fuzzy');
    expect(fuzzyDecisions.length).toBeGreaterThan(0);
    expect(fuzzyDecisions[0].similarityScore).toBeDefined();
    expect(fuzzyDecisions[0].similarityScore).toBeGreaterThanOrEqual(0.5);
    expect(fuzzyDecisions[0].similarityScore).toBeLessThanOrEqual(1.0);
  });

  it('should record exact match decisions', () => {
    diffEngine.setDebugMode(true);

    const doc1 = createMultiParagraphDocument(['First paragraph', 'Second paragraph']);
    const doc2 = createMultiParagraphDocument(['First paragraph', 'Second paragraph']);

    const result = diffEngine.diffDocumentsWithDebug(doc1, doc2);

    const exactDecisions = result.alignmentDecisions!.filter(d => d.matchType === 'exact');
    expect(exactDecisions.length).toBe(2);
    expect(exactDecisions.every(d => d.similarityScore === 1.0)).toBe(true);
    expect(exactDecisions.every(d => d.reason.includes('Exact text match'))).toBe(true);
  });

  it('should record delete decisions for unmatched originals', () => {
    diffEngine.setDebugMode(true);

    const doc1 = createMultiParagraphDocument(['Keep this', 'Delete this completely different text']);
    const doc2 = createMultiParagraphDocument(['Keep this']);

    const result = diffEngine.diffDocumentsWithDebug(doc1, doc2);

    const deleteDecisions = result.alignmentDecisions!.filter(d => d.matchType === 'delete');
    expect(deleteDecisions.length).toBe(1);
    expect(deleteDecisions[0].originalIndex).not.toBeNull();
    expect(deleteDecisions[0].currentIndex).toBeNull();
    expect(deleteDecisions[0].reason).toContain('No match found');
  });

  it('should record insert decisions for unmatched current blocks', () => {
    diffEngine.setDebugMode(true);

    const doc1 = createMultiParagraphDocument(['Existing paragraph']);
    const doc2 = createMultiParagraphDocument(['Existing paragraph', 'New paragraph added']);

    const result = diffEngine.diffDocumentsWithDebug(doc1, doc2);

    const insertDecisions = result.alignmentDecisions!.filter(d => d.matchType === 'insert');
    expect(insertDecisions.length).toBe(1);
    expect(insertDecisions[0].originalIndex).toBeNull();
    expect(insertDecisions[0].currentIndex).not.toBeNull();
    expect(insertDecisions[0].reason).toContain('No matching block');
  });

  it('should include word diff summary (added/removed/unchanged counts)', () => {
    diffEngine.setDebugMode(true);

    const doc1 = createSimpleDocument('One two three four five');
    const doc2 = createSimpleDocument('One two NEW three CHANGED five');

    const result = diffEngine.diffDocumentsWithDebug(doc1, doc2);

    expect(result.diff.blockDiffs[0].wordDiff).toBeDefined();
    // The word diff should contain changes
    const wordDiff = result.diff.blockDiffs[0].wordDiff!;
    const hasAdded = wordDiff.some(c => c.added);
    const hasRemoved = wordDiff.some(c => c.removed);
    expect(hasAdded || hasRemoved).toBe(true);
  });

  it('should capture alignment reason for each decision', () => {
    diffEngine.setDebugMode(true);

    const doc1 = createMultiParagraphDocument(['A', 'B', 'C']);
    const doc2 = createMultiParagraphDocument(['A', 'B modified slightly', 'C', 'D']);

    const result = diffEngine.diffDocumentsWithDebug(doc1, doc2);

    expect(result.alignmentDecisions!.every(d => d.reason.length > 0)).toBe(true);
  });

  it('should include text previews for decisions', () => {
    diffEngine.setDebugMode(true);

    const doc1 = createSimpleDocument('Original text here');
    const doc2 = createSimpleDocument('Current text here');

    const result = diffEngine.diffDocumentsWithDebug(doc1, doc2);

    const decision = result.alignmentDecisions![0];
    expect(decision.originalPreview || decision.currentPreview).toBeDefined();
  });
});

describe('DebugExporter', () => {
  let debugExporter: DebugExporter;
  let diffEngine: DiffEngine;

  beforeEach(() => {
    debugExporter = new DebugExporter();
    diffEngine = new DiffEngine();
    diffEngine.setDebugMode(true);
  });

  it('should generate valid JSON report', () => {
    const doc1 = createSimpleDocument('Hello world');
    const doc2 = createSimpleDocument('Hello beautiful world');
    const result = diffEngine.diffDocumentsWithDebug(doc1, doc2);

    const report = debugExporter.generateReport(
      doc1,
      doc2,
      result.diff,
      result.alignmentDecisions!,
      'original.docx',
      'current.docx'
    );

    // Should be valid JSON (not throw when stringifying)
    const json = JSON.stringify(report);
    expect(json).toBeDefined();
    expect(JSON.parse(json)).toEqual(report);
  });

  it('should include parsing section with block counts', () => {
    const doc1 = createMultiParagraphDocument(['A', 'B', 'C']);
    const doc2 = createMultiParagraphDocument(['A', 'B', 'C', 'D']);
    const result = diffEngine.diffDocumentsWithDebug(doc1, doc2);

    const report = debugExporter.generateReport(
      doc1,
      doc2,
      result.diff,
      result.alignmentDecisions!,
      'original.docx',
      'current.docx'
    );

    expect(report.parsing.original.blockCount).toBe(3);
    expect(report.parsing.current.blockCount).toBe(4);
  });

  it('should include text previews (first 100 chars)', () => {
    const longText = 'A'.repeat(200);
    const doc1 = createSimpleDocument(longText);
    const doc2 = createSimpleDocument(longText);
    const result = diffEngine.diffDocumentsWithDebug(doc1, doc2);

    const report = debugExporter.generateReport(
      doc1,
      doc2,
      result.diff,
      result.alignmentDecisions!,
      'original.docx',
      'current.docx'
    );

    expect(report.parsing.original.blocks[0].textPreview.length).toBeLessThanOrEqual(100);
    expect(report.parsing.original.blocks[0].textLength).toBe(200);
  });

  it('should include alignment decisions array', () => {
    const doc1 = createMultiParagraphDocument(['A', 'B']);
    const doc2 = createMultiParagraphDocument(['A', 'C']);
    const result = diffEngine.diffDocumentsWithDebug(doc1, doc2);

    const report = debugExporter.generateReport(
      doc1,
      doc2,
      result.diff,
      result.alignmentDecisions!,
      'original.docx',
      'current.docx'
    );

    expect(report.alignment.decisions).toBeDefined();
    expect(Array.isArray(report.alignment.decisions)).toBe(true);
    expect(report.alignment.decisions.length).toBeGreaterThan(0);
  });

  it('should include diff section with full text for changes', () => {
    const doc1 = createSimpleDocument('Original text');
    const doc2 = createSimpleDocument('Modified text');
    const result = diffEngine.diffDocumentsWithDebug(doc1, doc2);

    const report = debugExporter.generateReport(
      doc1,
      doc2,
      result.diff,
      result.alignmentDecisions!,
      'original.docx',
      'current.docx'
    );

    expect(report.diffs.length).toBeGreaterThan(0);
    expect(report.diffs[0].originalText).toBeDefined();
    expect(report.diffs[0].currentText).toBeDefined();
  });

  it('should calculate correct word diff statistics', () => {
    const doc1 = createSimpleDocument('One two three');
    const doc2 = createSimpleDocument('One NEW three ADDED');
    const result = diffEngine.diffDocumentsWithDebug(doc1, doc2);

    const report = debugExporter.generateReport(
      doc1,
      doc2,
      result.diff,
      result.alignmentDecisions!,
      'original.docx',
      'current.docx'
    );

    const modifiedDiff = report.diffs.find(d => d.type === 'modify');
    expect(modifiedDiff).toBeDefined();
    expect(modifiedDiff!.wordDiffSummary).toBeDefined();
    expect(modifiedDiff!.wordDiffSummary!.addedWords).toBeGreaterThan(0);
    expect(modifiedDiff!.wordDiffSummary!.removedWords).toBeGreaterThan(0);
  });

  it('should trigger file download with correct filename', () => {
    const doc1 = createSimpleDocument('Hello');
    const doc2 = createSimpleDocument('Hello');
    const result = diffEngine.diffDocumentsWithDebug(doc1, doc2);

    const report = debugExporter.generateReport(
      doc1,
      doc2,
      result.diff,
      result.alignmentDecisions!,
      'original.docx',
      'current.docx'
    );

    // Mock document methods
    const mockAnchor = {
      href: '',
      download: '',
      click: vi.fn()
    };
    const mockCreateElement = vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor as any);
    const mockAppendChild = vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockAnchor as any);
    const mockRemoveChild = vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockAnchor as any);
    const mockCreateObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    const mockRevokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    debugExporter.exportToFile(report);

    expect(mockCreateElement).toHaveBeenCalledWith('a');
    expect(mockAnchor.download).toContain('debug-report-');
    expect(mockAnchor.download).toContain('.json');
    expect(mockAnchor.click).toHaveBeenCalled();

    // Cleanup
    mockCreateElement.mockRestore();
    mockAppendChild.mockRestore();
    mockRemoveChild.mockRestore();
    mockCreateObjectURL.mockRestore();
    mockRevokeObjectURL.mockRestore();
  });

  it('should include timestamp in report', () => {
    const doc1 = createSimpleDocument('Hello');
    const doc2 = createSimpleDocument('Hello');
    const result = diffEngine.diffDocumentsWithDebug(doc1, doc2);

    const report = debugExporter.generateReport(
      doc1,
      doc2,
      result.diff,
      result.alignmentDecisions!,
      'original.docx',
      'current.docx'
    );

    expect(report.timestamp).toBeDefined();
    expect(new Date(report.timestamp).getTime()).not.toBeNaN();
  });

  it('should include file names in report', () => {
    const doc1 = createSimpleDocument('Hello');
    const doc2 = createSimpleDocument('Hello');
    const result = diffEngine.diffDocumentsWithDebug(doc1, doc2);

    const report = debugExporter.generateReport(
      doc1,
      doc2,
      result.diff,
      result.alignmentDecisions!,
      'original.docx',
      'current.docx'
    );

    expect(report.originalFile).toBe('original.docx');
    expect(report.currentFile).toBe('current.docx');
  });

  it('should calculate alignment statistics correctly', () => {
    const doc1 = createMultiParagraphDocument(['Same', 'Modified text here', 'Deleted']);
    const doc2 = createMultiParagraphDocument(['Same', 'Modified text changed', 'Inserted']);
    const result = diffEngine.diffDocumentsWithDebug(doc1, doc2);

    const report = debugExporter.generateReport(
      doc1,
      doc2,
      result.diff,
      result.alignmentDecisions!,
      'original.docx',
      'current.docx'
    );

    const totalDecisions =
      report.alignment.exactMatches +
      report.alignment.fuzzyMatches +
      report.alignment.deletions +
      report.alignment.insertions;

    expect(totalDecisions).toBe(report.alignment.decisions.length);
    expect(report.alignment.exactMatches).toBeGreaterThanOrEqual(0);
  });
});

describe('Debug Mode Edge Cases', () => {
  let diffEngine: DiffEngine;
  let debugExporter: DebugExporter;

  beforeEach(() => {
    diffEngine = new DiffEngine();
    diffEngine.setDebugMode(true);
    debugExporter = new DebugExporter();
  });

  it('should handle empty documents', () => {
    const doc1 = createEmptyDocument();
    const doc2 = createEmptyDocument();

    const result = diffEngine.diffDocumentsWithDebug(doc1, doc2);

    expect(result.alignmentDecisions).toBeDefined();
    expect(result.alignmentDecisions!.length).toBe(0);
    expect(result.diff.totalChanges).toBe(0);

    const report = debugExporter.generateReport(
      doc1,
      doc2,
      result.diff,
      result.alignmentDecisions!,
      'original.docx',
      'current.docx'
    );

    expect(report.parsing.original.blockCount).toBe(0);
    expect(report.parsing.current.blockCount).toBe(0);
  });

  it('should handle identical documents (no changes)', () => {
    const doc1 = createMultiParagraphDocument(['Same', 'Content', 'Here']);
    const doc2 = createMultiParagraphDocument(['Same', 'Content', 'Here']);

    const result = diffEngine.diffDocumentsWithDebug(doc1, doc2);

    expect(result.diff.totalChanges).toBe(0);

    const exactMatches = result.alignmentDecisions!.filter(d => d.matchType === 'exact');
    expect(exactMatches.length).toBe(3);

    const report = debugExporter.generateReport(
      doc1,
      doc2,
      result.diff,
      result.alignmentDecisions!,
      'original.docx',
      'current.docx'
    );

    expect(report.alignment.exactMatches).toBe(3);
    expect(report.alignment.fuzzyMatches).toBe(0);
    expect(report.alignment.deletions).toBe(0);
    expect(report.alignment.insertions).toBe(0);
  });

  it('should handle completely different documents', () => {
    const doc1 = createMultiParagraphDocument(['AAAA', 'BBBB', 'CCCC']);
    const doc2 = createMultiParagraphDocument(['XXXX', 'YYYY', 'ZZZZ']);

    const result = diffEngine.diffDocumentsWithDebug(doc1, doc2);

    // Should have deletions and/or insertions (no matches)
    const exactMatches = result.alignmentDecisions!.filter(d => d.matchType === 'exact');
    expect(exactMatches.length).toBe(0);

    const report = debugExporter.generateReport(
      doc1,
      doc2,
      result.diff,
      result.alignmentDecisions!,
      'original.docx',
      'current.docx'
    );

    expect(report.alignment.exactMatches).toBe(0);
    // All should be either delete+insert or fuzzy (but likely delete+insert with 0% similarity)
    expect(report.alignment.deletions + report.alignment.insertions + report.alignment.fuzzyMatches).toBeGreaterThan(0);
  });

  it('should handle documents with page breaks', () => {
    const doc1 = createDocument([
      createParagraph('Before break', { id: 'p1' }),
      createPageBreak('pb1'),
      createParagraph('After break', { id: 'p2' })
    ]);
    const doc2 = createDocument([
      createParagraph('Before break', { id: 'p1' }),
      createPageBreak('pb1'),
      createParagraph('After break modified', { id: 'p2' })
    ]);

    const result = diffEngine.diffDocumentsWithDebug(doc1, doc2);

    expect(result.alignmentDecisions).toBeDefined();

    const report = debugExporter.generateReport(
      doc1,
      doc2,
      result.diff,
      result.alignmentDecisions!,
      'original.docx',
      'current.docx'
    );

    // Should have page breaks in the parsing info
    const pageBreaks = report.parsing.original.blocks.filter(b => b.type === 'page-break');
    expect(pageBreaks.length).toBe(1);
  });

  it('should handle large documents (50+ blocks)', () => {
    const doc1 = createLargeDocument(60);
    const doc2 = createLargeDocument(60);

    // Modify some blocks
    doc2.blocks[10].text = 'Modified paragraph 10';
    doc2.blocks[30].text = 'Modified paragraph 30';
    doc2.blocks[50].text = 'Modified paragraph 50';

    const result = diffEngine.diffDocumentsWithDebug(doc1, doc2);

    expect(result.alignmentDecisions).toBeDefined();
    // Decisions may include fuzzy matches for modified blocks and delete/insert for unmatched
    // The total should be at least 60 (one for each original block) but may be more if
    // modified blocks result in separate delete + insert decisions
    expect(result.alignmentDecisions!.length).toBeGreaterThanOrEqual(60);

    const report = debugExporter.generateReport(
      doc1,
      doc2,
      result.diff,
      result.alignmentDecisions!,
      'original.docx',
      'current.docx'
    );

    expect(report.parsing.original.blockCount).toBe(60);
    expect(report.parsing.current.blockCount).toBe(60);
    expect(report.alignment.decisions.length).toBeGreaterThanOrEqual(60);
  });

  it('should include all blocks even if similarity is 0', () => {
    const doc1 = createSimpleDocument('AAAA BBBB CCCC DDDD');
    const doc2 = createSimpleDocument('XXXX YYYY ZZZZ WWWW');

    const result = diffEngine.diffDocumentsWithDebug(doc1, doc2);

    // Should still have decisions for all blocks
    expect(result.alignmentDecisions!.length).toBeGreaterThan(0);

    const report = debugExporter.generateReport(
      doc1,
      doc2,
      result.diff,
      result.alignmentDecisions!,
      'original.docx',
      'current.docx'
    );

    // Diffs should include the blocks
    expect(report.diffs.length).toBeGreaterThan(0);
  });

  it('should handle empty original with content in current', () => {
    const doc1 = createEmptyDocument();
    const doc2 = createMultiParagraphDocument(['New content']);

    const result = diffEngine.diffDocumentsWithDebug(doc1, doc2);

    const insertDecisions = result.alignmentDecisions!.filter(d => d.matchType === 'insert');
    expect(insertDecisions.length).toBe(1);

    const report = debugExporter.generateReport(
      doc1,
      doc2,
      result.diff,
      result.alignmentDecisions!,
      'original.docx',
      'current.docx'
    );

    expect(report.alignment.insertions).toBe(1);
    expect(report.diffs[0].type).toBe('insert');
  });

  it('should handle content in original with empty current', () => {
    const doc1 = createMultiParagraphDocument(['Old content']);
    const doc2 = createEmptyDocument();

    const result = diffEngine.diffDocumentsWithDebug(doc1, doc2);

    const deleteDecisions = result.alignmentDecisions!.filter(d => d.matchType === 'delete');
    expect(deleteDecisions.length).toBe(1);

    const report = debugExporter.generateReport(
      doc1,
      doc2,
      result.diff,
      result.alignmentDecisions!,
      'original.docx',
      'current.docx'
    );

    expect(report.alignment.deletions).toBe(1);
    expect(report.diffs[0].type).toBe('delete');
  });

  it('should handle blocks with formatting', () => {
    const doc1 = createSimpleDocument('Plain text', {});
    const doc2 = createSimpleDocument('Plain text', { bold: true });

    const result = diffEngine.diffDocumentsWithDebug(doc1, doc2);

    const report = debugExporter.generateReport(
      doc1,
      doc2,
      result.diff,
      result.alignmentDecisions!,
      'original.docx',
      'current.docx'
    );

    // Should detect formatting differences
    expect(report.parsing.original.blocks[0].hasFormatting).toBe(false);
    expect(report.parsing.current.blocks[0].hasFormatting).toBe(true);
  });

  it('should correctly count words in blocks', () => {
    const doc1 = createSimpleDocument('One two three four five');
    const doc2 = createSimpleDocument('One two three');

    const result = diffEngine.diffDocumentsWithDebug(doc1, doc2);

    const report = debugExporter.generateReport(
      doc1,
      doc2,
      result.diff,
      result.alignmentDecisions!,
      'original.docx',
      'current.docx'
    );

    expect(report.parsing.original.blocks[0].wordCount).toBe(5);
    expect(report.parsing.current.blocks[0].wordCount).toBe(3);
  });
});
