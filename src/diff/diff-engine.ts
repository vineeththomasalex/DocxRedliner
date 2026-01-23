// Diff Engine - Two-level diffing strategy

import { diffWords, type Change } from 'diff';
import diff_match_patch from 'diff-match-patch';
import type { DocumentAST, Block, TextFormatting } from '../types/ast.types';
import type { BlockDiff, DiffChange, DocumentDiff } from '../types/diff.types';

export class DiffEngine {
  private dmp: diff_match_patch;

  constructor() {
    this.dmp = new diff_match_patch();
  }

  diffDocuments(originalAST: DocumentAST, currentAST: DocumentAST): DocumentDiff {
    // Step 1: Align blocks using diff-match-patch
    const alignment = this.alignBlocks(originalAST.blocks, currentAST.blocks);

    // Step 2: Create block diffs
    const blockDiffs: BlockDiff[] = [];
    let changeId = 0;

    alignment.forEach(([origBlock, currBlock]) => {
      if (!origBlock && currBlock) {
        // Inserted block
        blockDiffs.push({
          type: 'insert',
          currentBlock: currBlock,
          changeId: `change-${changeId++}`
        });
      } else if (origBlock && !currBlock) {
        // Deleted block
        blockDiffs.push({
          type: 'delete',
          originalBlock: origBlock,
          changeId: `change-${changeId++}`
        });
      } else if (origBlock && currBlock) {
        // Check if blocks are identical
        if (origBlock.text === currBlock.text && this.formatingsEqual(origBlock.formatting, currBlock.formatting)) {
          // Unchanged
          blockDiffs.push({
            type: 'unchanged',
            originalBlock: origBlock,
            currentBlock: currBlock
          });
        } else {
          // Modified block - perform word-level diff
          const wordDiff = diffWords(origBlock.text, currBlock.text);
          const formatDiff = this.diffFormatting(origBlock, currBlock, wordDiff);

          const hasChanges = wordDiff.some(change => change.added || change.removed) ||
                           formatDiff.some(fc => fc.type === 'format-change');

          blockDiffs.push({
            type: hasChanges ? 'modify' : 'unchanged',
            originalBlock: origBlock,
            currentBlock: currBlock,
            wordDiff,
            formatDiff,
            changeId: hasChanges ? `change-${changeId++}` : undefined
          });
        }
      }
    });

    return {
      blockDiffs,
      totalChanges: changeId
    };
  }

  private alignBlocks(originalBlocks: Block[], currentBlocks: Block[]): [Block | null, Block | null][] {
    const alignment: [Block | null, Block | null][] = [];

    // Simple alignment strategy for MVP
    // Use block text for alignment with diff-match-patch
    const origTexts = originalBlocks.map(b => b.text).join('\n\n');
    const currTexts = currentBlocks.map(b => b.text).join('\n\n');

    const diffs = this.dmp.diff_main(origTexts, currTexts);
    this.dmp.diff_cleanupSemantic(diffs);

    // Convert diffs to block alignment
    let origIndex = 0;
    let currIndex = 0;

    diffs.forEach((diff) => {
      const [operation, text] = diff;
      const lineCount = text.split('\n\n').length - 1;

      if (operation === 0) { // EQUAL
        // Match blocks
        for (let i = 0; i <= lineCount; i++) {
          if (origIndex < originalBlocks.length && currIndex < currentBlocks.length) {
            alignment.push([originalBlocks[origIndex++], currentBlocks[currIndex++]]);
          }
        }
      } else if (operation === -1) { // DELETE
        // Original blocks deleted
        for (let i = 0; i <= lineCount; i++) {
          if (origIndex < originalBlocks.length) {
            alignment.push([originalBlocks[origIndex++], null]);
          }
        }
      } else if (operation === 1) { // INSERT
        // New blocks added
        for (let i = 0; i <= lineCount; i++) {
          if (currIndex < currentBlocks.length) {
            alignment.push([null, currentBlocks[currIndex++]]);
          }
        }
      }
    });

    // Add any remaining blocks
    while (origIndex < originalBlocks.length) {
      alignment.push([originalBlocks[origIndex++], null]);
    }
    while (currIndex < currentBlocks.length) {
      alignment.push([null, currentBlocks[currIndex++]]);
    }

    return alignment;
  }

  private diffFormatting(origBlock: Block, currBlock: Block, wordDiff: Change[]): DiffChange[] {
    const formatChanges: DiffChange[] = [];

    // For MVP, do simple formatting comparison at block level
    wordDiff.forEach((change) => {
      if (change.added) {
        formatChanges.push({
          type: 'insert',
          text: change.value,
          formatting: currBlock.formatting
        });
      } else if (change.removed) {
        formatChanges.push({
          type: 'delete',
          text: change.value,
          formatting: origBlock.formatting
        });
      } else {
        // Check if formatting changed
        const formatDiff = this.compareFormatting(origBlock.formatting, currBlock.formatting);

        if (formatDiff.changed) {
          formatChanges.push({
            type: 'format-change',
            text: change.value,
            from: origBlock.formatting,
            to: currBlock.formatting,
            changes: formatDiff.changes
          });
        } else {
          formatChanges.push({
            type: 'unchanged',
            text: change.value,
            formatting: origBlock.formatting
          });
        }
      }
    });

    return formatChanges;
  }

  private compareFormatting(fmt1: TextFormatting, fmt2: TextFormatting): { changed: boolean; changes: Record<string, { from: any; to: any }> } {
    const changes: Record<string, { from: any; to: any }> = {};
    let hasChanges = false;

    const keys: (keyof TextFormatting)[] = ['bold', 'italic', 'underline', 'color', 'font', 'fontSize'];

    keys.forEach((key) => {
      if (fmt1[key] !== fmt2[key]) {
        changes[key] = { from: fmt1[key], to: fmt2[key] };
        hasChanges = true;
      }
    });

    return { changed: hasChanges, changes };
  }

  private formatingsEqual(fmt1: TextFormatting, fmt2: TextFormatting): boolean {
    return (
      fmt1.bold === fmt2.bold &&
      fmt1.italic === fmt2.italic &&
      fmt1.underline === fmt2.underline &&
      fmt1.color === fmt2.color &&
      fmt1.font === fmt2.font &&
      fmt1.fontSize === fmt2.fontSize
    );
  }
}
