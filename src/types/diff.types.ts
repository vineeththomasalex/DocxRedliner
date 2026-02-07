// Diff type definitions

import type { Block, TextFormatting, SectionProperties } from './ast.types';
import type { Change } from 'diff';

export type DiffType = 'insert' | 'delete' | 'modify' | 'unchanged';

/**
 * Represents a phrase-level replacement where multiple consecutive word changes
 * are grouped into a single replacement operation.
 */
export interface PhraseReplacement {
  type: 'phrase-replace';
  deletedText: string;
  insertedText: string;
}

/**
 * A change that can be either an individual word change or a grouped phrase replacement.
 */
export type GroupedChange = Change | PhraseReplacement;

export interface FormatChange {
  type: 'format-change';
  text: string;
  from: TextFormatting;
  to: TextFormatting;
  changes: Record<string, { from: any; to: any }>;
}

export interface TextChange {
  type: 'insert' | 'delete' | 'unchanged';
  text: string;
  formatting: TextFormatting;
}

export type DiffChange = FormatChange | TextChange;

export interface BlockDiff {
  type: DiffType;
  originalBlock?: Block;
  currentBlock?: Block;
  wordDiff?: Change[];
  groupedDiff?: GroupedChange[];  // Grouped changes for better display
  formatDiff?: DiffChange[];
  changeId?: string;
}

export interface DocumentDiff {
  blockDiffs: BlockDiff[];
  totalChanges: number;
  sectionProperties?: SectionProperties;
}
