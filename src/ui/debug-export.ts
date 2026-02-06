// Debug Export - Generate and download debug reports

import type { DocumentAST, Block } from '../types/ast.types';
import type { DocumentDiff, BlockDiff } from '../types/diff.types';
import type {
  DebugReport,
  ParsingDebug,
  BlockDebug,
  AlignmentDebug,
  AlignmentDecision,
  BlockDiffDebug
} from '../types/debug.types';

export class DebugExporter {
  /**
   * Generate a debug report from the diff results
   */
  generateReport(
    originalAST: DocumentAST,
    currentAST: DocumentAST,
    diff: DocumentDiff,
    alignmentDecisions: AlignmentDecision[],
    originalFileName: string,
    currentFileName: string
  ): DebugReport {
    return {
      timestamp: new Date().toISOString(),
      originalFile: originalFileName,
      currentFile: currentFileName,
      parsing: this.generateParsingDebug(originalAST, currentAST),
      alignment: this.generateAlignmentDebug(alignmentDecisions),
      diffs: this.generateDiffDebug(diff)
    };
  }

  /**
   * Generate parsing debug info from ASTs
   */
  private generateParsingDebug(originalAST: DocumentAST, currentAST: DocumentAST): ParsingDebug {
    return {
      original: {
        blockCount: originalAST.blocks.length,
        blocks: originalAST.blocks.map((block, index) => this.blockToDebug(block, index))
      },
      current: {
        blockCount: currentAST.blocks.length,
        blocks: currentAST.blocks.map((block, index) => this.blockToDebug(block, index))
      }
    };
  }

  /**
   * Convert a block to debug info
   */
  private blockToDebug(block: Block, index: number): BlockDebug {
    const wordCount = block.text.trim() ? block.text.trim().split(/\s+/).length : 0;
    const hasFormatting = !!(
      block.formatting.bold ||
      block.formatting.italic ||
      block.formatting.underline ||
      block.formatting.color ||
      block.formatting.font ||
      block.formatting.fontSize
    );

    return {
      index,
      type: block.type,
      textPreview: block.text.substring(0, 100),
      textLength: block.text.length,
      wordCount,
      hasFormatting
    };
  }

  /**
   * Generate alignment debug info from decisions
   */
  private generateAlignmentDebug(decisions: AlignmentDecision[]): AlignmentDebug {
    let exactMatches = 0;
    let fuzzyMatches = 0;
    let deletions = 0;
    let insertions = 0;

    for (const decision of decisions) {
      switch (decision.matchType) {
        case 'exact':
          exactMatches++;
          break;
        case 'fuzzy':
          fuzzyMatches++;
          break;
        case 'delete':
          deletions++;
          break;
        case 'insert':
          insertions++;
          break;
      }
    }

    return {
      exactMatches,
      fuzzyMatches,
      deletions,
      insertions,
      decisions
    };
  }

  /**
   * Generate diff debug info from DocumentDiff
   */
  private generateDiffDebug(diff: DocumentDiff): BlockDiffDebug[] {
    return diff.blockDiffs.map(blockDiff => this.blockDiffToDebug(blockDiff));
  }

  /**
   * Convert a BlockDiff to debug info
   */
  private blockDiffToDebug(blockDiff: BlockDiff): BlockDiffDebug {
    const debug: BlockDiffDebug = {
      type: blockDiff.type,
      changeId: blockDiff.changeId
    };

    if (blockDiff.originalBlock) {
      debug.originalText = blockDiff.originalBlock.text;
    }
    if (blockDiff.currentBlock) {
      debug.currentText = blockDiff.currentBlock.text;
    }

    // Calculate word diff summary if word diff is available
    if (blockDiff.wordDiff) {
      let addedWords = 0;
      let removedWords = 0;
      let unchangedWords = 0;

      for (const change of blockDiff.wordDiff) {
        const wordCount = change.value.trim() ? change.value.trim().split(/\s+/).length : 0;
        if (change.added) {
          addedWords += wordCount;
        } else if (change.removed) {
          removedWords += wordCount;
        } else {
          unchangedWords += wordCount;
        }
      }

      debug.wordDiffSummary = {
        addedWords,
        removedWords,
        unchangedWords
      };
    }

    return debug;
  }

  /**
   * Export a debug report as a downloadable JSON file
   */
  exportToFile(report: DebugReport): void {
    const json = JSON.stringify(report, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `debug-report-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
