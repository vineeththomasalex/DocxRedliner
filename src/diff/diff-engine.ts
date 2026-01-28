// Diff Engine - Two-level diffing strategy

import { diffWords, type Change } from 'diff';
import type { DocumentAST, Block, TextFormatting } from '../types/ast.types';
import type { BlockDiff, DiffChange, DocumentDiff } from '../types/diff.types';

export class DiffEngine {
  constructor() {
    // Constructor no longer needs to initialize diff-match-patch
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
      totalChanges: changeId,
      // Use current document's section properties for the output
      sectionProperties: currentAST.sectionProperties
    };
  }

  private alignBlocks(originalBlocks: Block[], currentBlocks: Block[]): [Block | null, Block | null][] {
    const alignment: [Block | null, Block | null][] = [];

    // Hash-based block matching with whitespace normalization
    const normalizeText = (text: string) => text.trim().replace(/\s+/g, ' ');
    const hashBlock = (block: Block) => normalizeText(block.text);

    // Helper to calculate similarity between two blocks (0-1 scale)
    const calculateSimilarity = (block1: Block, block2: Block): number => {
      const text1 = normalizeText(block1.text);
      const text2 = normalizeText(block2.text);

      if (text1 === text2) return 1.0;
      if (!text1 || !text2) return 0.0;

      // Use simple word overlap ratio
      const words1 = text1.split(/\s+/);
      const words2 = text2.split(/\s+/);
      const set1 = new Set(words1);
      const set2 = new Set(words2);

      let overlap = 0;
      set1.forEach(word => {
        if (set2.has(word)) overlap++;
      });

      return (2 * overlap) / (set1.size + set2.size);
    };

    // Create hash map of current blocks for fast exact matching
    const currentMap = new Map<string, Block[]>();
    currentBlocks.forEach(block => {
      const hash = hashBlock(block);
      if (!currentMap.has(hash)) {
        currentMap.set(hash, []);
      }
      currentMap.get(hash)!.push(block);
    });

    const usedCurrent = new Set<number>();
    const unmatchedOriginal: Array<{ block: Block, index: number }> = [];

    // First pass: Exact hash matching
    originalBlocks.forEach((origBlock, origIndex) => {
      const hash = hashBlock(origBlock);
      const matches = currentMap.get(hash) || [];

      // Find first unused exact match
      let matched = false;
      for (let i = 0; i < matches.length; i++) {
        const currIndex = currentBlocks.indexOf(matches[i]);
        if (!usedCurrent.has(currIndex)) {
          alignment.push([origBlock, matches[i]]);
          usedCurrent.add(currIndex);
          matched = true;
          break;
        }
      }

      if (!matched) {
        unmatchedOriginal.push({ block: origBlock, index: origIndex });
      }
    });

    // Second pass: Fuzzy matching for unmatched blocks (likely modifications)
    const SIMILARITY_THRESHOLD = 0.5; // 50% word overlap
    unmatchedOriginal.forEach(({ block: origBlock, index: _origIndex }) => {
      type BestMatchType = { block: Block, index: number, similarity: number };
      let bestMatch: BestMatchType | null = null;

      currentBlocks.forEach((currBlock, currIndex) => {
        if (usedCurrent.has(currIndex)) return;

        const similarity = calculateSimilarity(origBlock, currBlock);
        if (similarity >= SIMILARITY_THRESHOLD) {
          if (!bestMatch || similarity > bestMatch.similarity) {
            bestMatch = { block: currBlock, index: currIndex, similarity };
          }
        }
      });

      if (bestMatch) {
        // Found a similar block - treat as modification
        const match: BestMatchType = bestMatch;
        alignment.push([origBlock, match.block]);
        usedCurrent.add(match.index);
      } else {
        // No similar block found - treat as deletion
        alignment.push([origBlock, null]);
      }
    });

    // Add unmatched current blocks (insertions)
    currentBlocks.forEach((currBlock, index) => {
      if (!usedCurrent.has(index)) {
        alignment.push([null, currBlock]);
      }
    });

    // Sort alignment by original document order
    alignment.sort((a, b) => {
      const aOrigIndex = a[0] ? originalBlocks.indexOf(a[0]) : Infinity;
      const bOrigIndex = b[0] ? originalBlocks.indexOf(b[0]) : Infinity;

      if (aOrigIndex !== bOrigIndex) return aOrigIndex - bOrigIndex;

      // If both are insertions, sort by current document order
      const aCurrIndex = a[1] ? currentBlocks.indexOf(a[1]) : Infinity;
      const bCurrIndex = b[1] ? currentBlocks.indexOf(b[1]) : Infinity;
      return aCurrIndex - bCurrIndex;
    });

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
