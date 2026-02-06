// Debug type definitions for diff engine diagnostics

export interface DebugReport {
  timestamp: string;
  originalFile: string;
  currentFile: string;
  parsing: ParsingDebug;
  alignment: AlignmentDebug;
  diffs: BlockDiffDebug[];
}

export interface ParsingDebug {
  original: { blockCount: number; blocks: BlockDebug[] };
  current: { blockCount: number; blocks: BlockDebug[] };
}

export interface BlockDebug {
  index: number;
  type: string;
  textPreview: string;      // First 100 chars
  textLength: number;
  wordCount: number;
  hasFormatting: boolean;
}

export interface AlignmentDebug {
  exactMatches: number;
  fuzzyMatches: number;
  deletions: number;
  insertions: number;
  decisions: AlignmentDecision[];
}

export interface AlignmentDecision {
  originalIndex: number | null;
  currentIndex: number | null;
  matchType: 'exact' | 'fuzzy' | 'delete' | 'insert';
  similarityScore?: number;
  reason: string;
  originalPreview?: string;
  currentPreview?: string;
}

export interface BlockDiffDebug {
  changeId?: string;
  type: 'unchanged' | 'insert' | 'delete' | 'modify';
  originalText?: string;
  currentText?: string;
  wordDiffSummary?: {
    addedWords: number;
    removedWords: number;
    unchangedWords: number;
  };
}
