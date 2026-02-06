// Unit tests for DiffRenderer - DOM-based tests (redlined view only)

import { describe, it, expect, beforeEach } from 'vitest';
import { DiffRenderer } from '../../src/renderer/diff-renderer';
import type { DocumentDiff } from '../../src/types/diff.types';
import { createParagraph } from '../helpers/ast-factory';

describe('DiffRenderer', () => {
  let redlinedPane: HTMLDivElement;
  let renderer: DiffRenderer;

  beforeEach(() => {
    // Set up DOM
    document.body.innerHTML = `
      <div id="pane-redlined-content"></div>
    `;

    redlinedPane = document.getElementById('pane-redlined-content') as HTMLDivElement;
    renderer = new DiffRenderer('pane-redlined-content');
  });

  describe('Constructor', () => {
    it('should throw error when pane not found', () => {
      expect(() => new DiffRenderer('nonexistent'))
        .toThrow('Redlined pane not found');
    });

    it('should initialize with valid pane ID', () => {
      expect(() => new DiffRenderer('pane-redlined-content'))
        .not.toThrow();
    });
  });

  describe('renderRedlined()', () => {
    it('should render unchanged blocks without highlighting', () => {
      const diff: DocumentDiff = {
        blockDiffs: [{
          type: 'unchanged',
          originalBlock: createParagraph('Same text', { id: 'b1' }),
          currentBlock: createParagraph('Same text', { id: 'b1' })
        }],
        totalChanges: 0
      };

      renderer.renderRedlined(diff);

      const block = redlinedPane.querySelector('.block');
      expect(block).not.toBeNull();
      expect(block!.classList.contains('block-unchanged')).toBe(true);
    });

    it('should render insertions with green highlighting', () => {
      const diff: DocumentDiff = {
        blockDiffs: [{
          type: 'insert',
          currentBlock: createParagraph('New content', { id: 'b1' }),
          changeId: 'change-0'
        }],
        totalChanges: 1
      };

      renderer.renderRedlined(diff);

      const block = redlinedPane.querySelector('.block');
      expect(block!.classList.contains('block-inserted')).toBe(true);
    });

    it('should render deletions with red highlighting', () => {
      const diff: DocumentDiff = {
        blockDiffs: [{
          type: 'delete',
          originalBlock: createParagraph('Deleted content', { id: 'b1' }),
          changeId: 'change-0'
        }],
        totalChanges: 1
      };

      renderer.renderRedlined(diff);

      const block = redlinedPane.querySelector('.block');
      expect(block!.classList.contains('block-deleted')).toBe(true);
    });

    it('should render modified blocks with inline changes', () => {
      const diff: DocumentDiff = {
        blockDiffs: [{
          type: 'modify',
          originalBlock: createParagraph('Hello world', { id: 'b1' }),
          currentBlock: createParagraph('Hello beautiful world', { id: 'b1' }),
          wordDiff: [
            { value: 'Hello ', count: 1 },
            { value: 'beautiful ', count: 1, added: true },
            { value: 'world', count: 1 }
          ],
          changeId: 'change-0'
        }],
        totalChanges: 1
      };

      renderer.renderRedlined(diff);

      const block = redlinedPane.querySelector('.block');
      expect(block!.classList.contains('block-modified')).toBe(true);

      const insertion = block!.querySelector('.diff-insert');
      expect(insertion).not.toBeNull();
      expect(insertion!.textContent).toContain('beautiful');
    });

    it('should render deletions with strikethrough styling', () => {
      const diff: DocumentDiff = {
        blockDiffs: [{
          type: 'modify',
          originalBlock: createParagraph('Hello beautiful world', { id: 'b1' }),
          currentBlock: createParagraph('Hello world', { id: 'b1' }),
          wordDiff: [
            { value: 'Hello ', count: 1 },
            { value: 'beautiful ', count: 1, removed: true },
            { value: 'world', count: 1 }
          ],
          changeId: 'change-0'
        }],
        totalChanges: 1
      };

      renderer.renderRedlined(diff);

      const block = redlinedPane.querySelector('.block');
      const deletion = block!.querySelector('.diff-delete');
      expect(deletion).not.toBeNull();
      expect(deletion!.textContent).toContain('beautiful');
    });

    it('should escape HTML in content', () => {
      const diff: DocumentDiff = {
        blockDiffs: [{
          type: 'unchanged',
          originalBlock: createParagraph('<script>alert("xss")</script>', { id: 'b1' }),
          currentBlock: createParagraph('<script>alert("xss")</script>', { id: 'b1' })
        }],
        totalChanges: 0
      };

      renderer.renderRedlined(diff);

      const block = redlinedPane.querySelector('.block');
      expect(block!.innerHTML).not.toContain('<script>');
      expect(block!.textContent).toContain('<script>');
    });

    it('should add data-change-id attribute to changed blocks', () => {
      const diff: DocumentDiff = {
        blockDiffs: [{
          type: 'insert',
          currentBlock: createParagraph('New', { id: 'b1' }),
          changeId: 'change-0'
        }],
        totalChanges: 1
      };

      renderer.renderRedlined(diff);

      const block = redlinedPane.querySelector('[data-change-id="change-0"]');
      expect(block).not.toBeNull();
    });

    it('should apply column styling when sectionProperties specify columns', () => {
      const diff: DocumentDiff = {
        blockDiffs: [{
          type: 'unchanged',
          originalBlock: createParagraph('Text', { id: 'b1' }),
          currentBlock: createParagraph('Text', { id: 'b1' })
        }],
        totalChanges: 0,
        sectionProperties: {
          columnCount: 2,
          columnSpace: 720 // 0.5 inch in twips
        }
      };

      renderer.renderRedlined(diff);

      expect(redlinedPane.style.columnCount).toBe('2');
    });

    it('should show both deletions and insertions in redlined view', () => {
      const diff: DocumentDiff = {
        blockDiffs: [{
          type: 'modify',
          originalBlock: createParagraph('The cat sat', { id: 'b1' }),
          currentBlock: createParagraph('The dog sat', { id: 'b1' }),
          wordDiff: [
            { value: 'The ', count: 1 },
            { value: 'cat', count: 1, removed: true },
            { value: 'dog', count: 1, added: true },
            { value: ' sat', count: 1 }
          ],
          changeId: 'change-0'
        }],
        totalChanges: 1
      };

      renderer.renderRedlined(diff);

      const block = redlinedPane.querySelector('.block');
      const deletion = block!.querySelector('.diff-delete');
      const insertion = block!.querySelector('.diff-insert');

      expect(deletion).not.toBeNull();
      expect(insertion).not.toBeNull();
    });
  });

  describe('getChangeElements()', () => {
    it('should return all elements with change IDs', () => {
      const diff: DocumentDiff = {
        blockDiffs: [
          {
            type: 'insert',
            currentBlock: createParagraph('Insert 1', { id: 'b1' }),
            changeId: 'change-0'
          },
          {
            type: 'unchanged',
            originalBlock: createParagraph('Same', { id: 'b2' }),
            currentBlock: createParagraph('Same', { id: 'b2' })
          },
          {
            type: 'delete',
            originalBlock: createParagraph('Delete 1', { id: 'b3' }),
            changeId: 'change-1'
          }
        ],
        totalChanges: 2
      };

      renderer.renderRedlined(diff);

      const changeElements = renderer.getChangeElements();
      expect(changeElements.length).toBe(2);
    });

    it('should return empty array when no changes', () => {
      const diff: DocumentDiff = {
        blockDiffs: [{
          type: 'unchanged',
          originalBlock: createParagraph('Same', { id: 'b1' }),
          currentBlock: createParagraph('Same', { id: 'b1' })
        }],
        totalChanges: 0
      };

      renderer.renderRedlined(diff);

      const changeElements = renderer.getChangeElements();
      expect(changeElements.length).toBe(0);
    });
  });

  describe('Formatting rendering', () => {
    it('should apply bold formatting', () => {
      const diff: DocumentDiff = {
        blockDiffs: [{
          type: 'unchanged',
          originalBlock: createParagraph('Bold text', {
            id: 'b1',
            formatting: { bold: true }
          }),
          currentBlock: createParagraph('Bold text', {
            id: 'b1',
            formatting: { bold: true }
          })
        }],
        totalChanges: 0
      };

      renderer.renderRedlined(diff);

      const strong = redlinedPane.querySelector('strong');
      expect(strong).not.toBeNull();
    });

    it('should apply italic formatting', () => {
      const diff: DocumentDiff = {
        blockDiffs: [{
          type: 'unchanged',
          originalBlock: createParagraph('Italic text', {
            id: 'b1',
            formatting: { italic: true }
          }),
          currentBlock: createParagraph('Italic text', {
            id: 'b1',
            formatting: { italic: true }
          })
        }],
        totalChanges: 0
      };

      renderer.renderRedlined(diff);

      const em = redlinedPane.querySelector('em');
      expect(em).not.toBeNull();
    });

    it('should apply underline formatting', () => {
      const diff: DocumentDiff = {
        blockDiffs: [{
          type: 'unchanged',
          originalBlock: createParagraph('Underlined text', {
            id: 'b1',
            formatting: { underline: true }
          }),
          currentBlock: createParagraph('Underlined text', {
            id: 'b1',
            formatting: { underline: true }
          })
        }],
        totalChanges: 0
      };

      renderer.renderRedlined(diff);

      const u = redlinedPane.querySelector('u');
      expect(u).not.toBeNull();
    });

    it('should apply color styling', () => {
      const diff: DocumentDiff = {
        blockDiffs: [{
          type: 'unchanged',
          originalBlock: createParagraph('Colored text', {
            id: 'b1',
            formatting: { color: '#FF0000' }
          }),
          currentBlock: createParagraph('Colored text', {
            id: 'b1',
            formatting: { color: '#FF0000' }
          })
        }],
        totalChanges: 0
      };

      renderer.renderRedlined(diff);

      const span = redlinedPane.querySelector('span[style*="color"]');
      expect(span).not.toBeNull();
    });
  });

  describe('Block types', () => {
    it('should render heading1 with appropriate class', () => {
      const headingBlock = {
        id: 'h1',
        type: 'heading1' as const,
        text: 'Heading',
        runs: [{ text: 'Heading', formatting: {} }],
        formatting: {}
      };

      const diff: DocumentDiff = {
        blockDiffs: [{
          type: 'unchanged',
          originalBlock: headingBlock,
          currentBlock: headingBlock
        }],
        totalChanges: 0
      };

      renderer.renderRedlined(diff);

      const heading = redlinedPane.querySelector('.para-heading1');
      expect(heading).not.toBeNull();
    });

    it('should render page breaks', () => {
      const pageBreakBlock = {
        id: 'pb1',
        type: 'page-break' as const,
        text: '',
        runs: [],
        formatting: {}
      };

      const diff: DocumentDiff = {
        blockDiffs: [{
          type: 'unchanged',
          originalBlock: pageBreakBlock,
          currentBlock: pageBreakBlock
        }],
        totalChanges: 0
      };

      renderer.renderRedlined(diff);

      const pageBreak = redlinedPane.querySelector('.block-page-break');
      expect(pageBreak).not.toBeNull();
    });
  });
});
