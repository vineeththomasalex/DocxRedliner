// AST type definitions for parsed DOCX documents

export interface TextFormatting {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  font?: string;
  fontSize?: number;
}

export interface TextRun {
  text: string;
  formatting: TextFormatting;
}

export interface Block {
  id: string;
  type: 'paragraph' | 'heading1' | 'heading2' | 'heading3' | 'table' | 'page-break';
  text: string;
  runs: TextRun[];
  formatting: TextFormatting;
}

export interface DocumentAST {
  metadata: {
    author?: string;
    title?: string;
    created?: Date;
    modified?: Date;
  };
  blocks: Block[];
}
