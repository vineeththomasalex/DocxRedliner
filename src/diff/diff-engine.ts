// Diff Engine - Two-level diffing strategy

import { diffWords, type Change } from 'diff';
import type { DocumentAST, Block, TextFormatting } from '../types/ast.types';
import type { BlockDiff, DiffChange, DocumentDiff, GroupedChange, PhraseReplacement } from '../types/diff.types';
import type { AlignmentDecision } from '../types/debug.types';

// Configuration for grouping consecutive word changes
const GROUPING_CONFIG = {
  CHANGE_DENSITY_THRESHOLD: 0.6,  // 60% of words must change to trigger grouping
  MIN_CHANGED_WORDS: 3,           // Minimum changed words to consider grouping
  MAX_UNCHANGED_GAP: 1,           // Max unchanged words before breaking a group
};

export interface DiffResult {
  diff: DocumentDiff;
  alignmentDecisions: AlignmentDecision[];
}

export class DiffEngine {
  private debugMode: boolean = false;

  constructor() {
    // Constructor no longer needs to initialize diff-match-patch
  }

  /**
   * Enable or disable debug mode
   */
  setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
  }

  /**
   * Check if debug mode is enabled
   */
  isDebugMode(): boolean {
    return this.debugMode;
  }

  diffDocuments(originalAST: DocumentAST, currentAST: DocumentAST): DocumentDiff {
    const result = this.diffDocumentsWithDebug(originalAST, currentAST);
    return result.diff;
  }

  diffDocumentsWithDebug(originalAST: DocumentAST, currentAST: DocumentAST): DiffResult {
    // Step 1: Align blocks using diff-match-patch
    const { alignment, decisions } = this.alignBlocks(originalAST.blocks, currentAST.blocks);

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
          const groupedDiff = this.groupConsecutiveChanges(wordDiff);
          const formatDiff = this.diffFormatting(origBlock, currBlock, wordDiff);

          const hasChanges = wordDiff.some(change => change.added || change.removed) ||
                           formatDiff.some(fc => fc.type === 'format-change');

          blockDiffs.push({
            type: hasChanges ? 'modify' : 'unchanged',
            originalBlock: origBlock,
            currentBlock: currBlock,
            wordDiff,
            groupedDiff,
            formatDiff,
            changeId: hasChanges ? `change-${changeId++}` : undefined
          });
        }
      }
    });

    const diff: DocumentDiff = {
      blockDiffs,
      totalChanges: changeId,
      // Use current document's section properties for the output
      sectionProperties: currentAST.sectionProperties
    };

    return {
      diff,
      alignmentDecisions: decisions
    };
  }

  private alignBlocks(originalBlocks: Block[], currentBlocks: Block[]): {
    alignment: [Block | null, Block | null][];
    decisions: AlignmentDecision[];
  } {
    const alignment: [Block | null, Block | null][] = [];
    const decisions: AlignmentDecision[] = [];

    // Hash-based block matching with whitespace normalization
    const normalizeText = (text: string) => text.trim().replace(/\s+/g, ' ');
    const hashBlock = (block: Block) => normalizeText(block.text);
    const textPreview = (text: string) => text.substring(0, 100);

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

          // Record exact match decision
          decisions.push({
            originalIndex: origIndex,
            currentIndex: currIndex,
            matchType: 'exact',
            similarityScore: 1.0,
            reason: 'Exact text match after whitespace normalization',
            originalPreview: textPreview(origBlock.text),
            currentPreview: textPreview(matches[i].text)
          });
          break;
        }
      }

      if (!matched) {
        unmatchedOriginal.push({ block: origBlock, index: origIndex });
      }
    });

    // Second pass: Fuzzy matching for unmatched blocks (likely modifications)
    const SIMILARITY_THRESHOLD = 0.5; // 50% word overlap
    unmatchedOriginal.forEach(({ block: origBlock, index: origIndex }) => {
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

        // Record fuzzy match decision
        decisions.push({
          originalIndex: origIndex,
          currentIndex: match.index,
          matchType: 'fuzzy',
          similarityScore: match.similarity,
          reason: `Fuzzy match: ${(match.similarity * 100).toFixed(1)}% word overlap (threshold: ${SIMILARITY_THRESHOLD * 100}%)`,
          originalPreview: textPreview(origBlock.text),
          currentPreview: textPreview(match.block.text)
        });
      } else {
        // No similar block found - treat as deletion
        alignment.push([origBlock, null]);

        // Record delete decision
        // Find the best similarity score for debugging
        let bestSimilarity = 0;
        let bestCandidateIndex: number | null = null;
        currentBlocks.forEach((currBlock, currIndex) => {
          if (usedCurrent.has(currIndex)) return;
          const similarity = calculateSimilarity(origBlock, currBlock);
          if (similarity > bestSimilarity) {
            bestSimilarity = similarity;
            bestCandidateIndex = currIndex;
          }
        });

        const reason = bestCandidateIndex !== null
          ? `No match found. Best candidate had ${(bestSimilarity * 100).toFixed(1)}% similarity (below ${SIMILARITY_THRESHOLD * 100}% threshold)`
          : 'No match found. No unmatched candidates remaining';

        decisions.push({
          originalIndex: origIndex,
          currentIndex: null,
          matchType: 'delete',
          similarityScore: bestSimilarity > 0 ? bestSimilarity : undefined,
          reason,
          originalPreview: textPreview(origBlock.text)
        });
      }
    });

    // Add unmatched current blocks (insertions)
    currentBlocks.forEach((currBlock, index) => {
      if (!usedCurrent.has(index)) {
        alignment.push([null, currBlock]);

        // Record insert decision
        decisions.push({
          originalIndex: null,
          currentIndex: index,
          matchType: 'insert',
          reason: 'No matching block in original document',
          currentPreview: textPreview(currBlock.text)
        });
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

    return { alignment, decisions };
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

  /**
   * Groups consecutive word changes into phrase-level replacements when the
   * change density is high enough. This improves readability for sentence rewrites.
   */
  private groupConsecutiveChanges(wordDiff: Change[]): GroupedChange[] {
    const result: GroupedChange[] = [];
    let i = 0;

    while (i < wordDiff.length) {
      const change = wordDiff[i];

      // Pass through unchanged text
      if (!change.added && !change.removed) {
        result.push(change);
        i++;
        continue;
      }

      // Found a change - look ahead to find span boundary
      const span = this.findChangeSpan(wordDiff, i);

      if (this.shouldGroup(span)) {
        // Collect all deleted and inserted text
        const deletedParts: string[] = [];
        const insertedParts: string[] = [];

        for (let j = span.start; j < span.end; j++) {
          const c = wordDiff[j];
          if (c.removed) {
            deletedParts.push(c.value);
          } else if (c.added) {
            insertedParts.push(c.value);
          } else {
            // Unchanged text goes to both (it's part of the phrase context)
            deletedParts.push(c.value);
            insertedParts.push(c.value);
          }
        }

        const phraseReplacement: PhraseReplacement = {
          type: 'phrase-replace',
          deletedText: deletedParts.join('').trim(),
          insertedText: insertedParts.join('').trim(),
        };
        result.push(phraseReplacement);

        i = span.end;
      } else {
        // Keep individual changes
        result.push(change);
        i++;
      }
    }

    return result;
  }

  /**
   * Finds the boundary of a change span - a sequence of changes with small
   * unchanged gaps between them.
   */
  private findChangeSpan(wordDiff: Change[], start: number): { start: number; end: number; changes: Change[] } {
    let end = start;
    let unchangedGap = 0;

    while (end < wordDiff.length) {
      const c = wordDiff[end];
      if (c.added || c.removed) {
        unchangedGap = 0;
        end++;
      } else {
        // Count words in unchanged segment
        const words = c.value.trim().split(/\s+/).filter(w => w.length > 0);
        unchangedGap += words.length;

        if (unchangedGap > GROUPING_CONFIG.MAX_UNCHANGED_GAP) {
          break; // Gap too large, end span here
        }
        end++;
      }
    }

    return { start, end, changes: wordDiff.slice(start, end) };
  }

  /**
   * Determines whether a span of changes should be grouped into a phrase replacement.
   */
  private shouldGroup(span: { changes: Change[] }): boolean {
    let totalWords = 0;
    let changedWords = 0;

    for (const c of span.changes) {
      const words = c.value.trim().split(/\s+/).filter(w => w.length > 0).length;
      totalWords += words;
      if (c.added || c.removed) {
        changedWords += words;
      }
    }

    const density = totalWords > 0 ? changedWords / totalWords : 0;
    return density >= GROUPING_CONFIG.CHANGE_DENSITY_THRESHOLD
        && changedWords >= GROUPING_CONFIG.MIN_CHANGED_WORDS;
  }
}
