// Diff type definitions

import type { Block, TextFormatting } from './ast.types';
import type { Change } from 'diff';

export type DiffType = 'insert' | 'delete' | 'modify' | 'unchanged';

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
  formatDiff?: DiffChange[];
  changeId?: string;
}

export interface DocumentDiff {
  blockDiffs: BlockDiff[];
  totalChanges: number;
}
