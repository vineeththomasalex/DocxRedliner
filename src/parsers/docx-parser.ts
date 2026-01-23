// DOCX Parser - Direct parsing in main thread using officeparser browser bundle

import type { DocumentAST, Block, TextRun, TextFormatting } from '../types/ast.types';

// Declare global officeParser (loaded from script tag)
declare global {
  interface Window {
    officeParser: {
      parseOffice: (input: ArrayBuffer) => Promise<any>;
    };
  }
}

export class DocxParser {
  private scriptLoaded: boolean = false;

  constructor() {
    this.ensureScriptLoaded();
  }

  private ensureScriptLoaded(): void {
    if (this.scriptLoaded) return;

    // Check if officeParser is already available
    if (typeof window.officeParser !== 'undefined') {
      this.scriptLoaded = true;
      return;
    }

    // Check if script tag exists
    const existingScript = document.querySelector('script[src="/officeparser.browser.js"]');
    if (existingScript) {
      this.scriptLoaded = true;
      return;
    }

    throw new Error('officeparser.browser.js not loaded. Add <script src="/officeparser.browser.js"></script> to index.html');
  }

  async parseFile(file: File): Promise<DocumentAST> {
    this.ensureScriptLoaded();

    // Read file as ArrayBuffer
    const buffer = await file.arrayBuffer();

    // Parse using officeparser
    const result = await window.officeParser.parseOffice(buffer);

    // Normalize the result to our AST format
    return this.normalizeAST(result);
  }

  private normalizeAST(rawData: any): DocumentAST {
    const blocks: Block[] = [];

    // Extract metadata
    const metadata = {
      author: rawData.author || undefined,
      title: rawData.title || undefined,
      created: rawData.created ? new Date(rawData.created) : undefined,
      modified: rawData.modified ? new Date(rawData.modified) : undefined
    };

    // Process content
    if (Array.isArray(rawData.content)) {
      rawData.content.forEach((item: any, index: number) => {
        if (item.type === 'paragraph' || item.type === 'heading') {
          const block = this.normalizeParagraph(item, index);
          if (block) {
            blocks.push(block);
          }
        } else if (item.type === 'table') {
          const block = this.normalizeTable(item, index);
          if (block) {
            blocks.push(block);
          }
        }
      });
    }

    return {
      metadata,
      blocks
    };
  }

  private normalizeParagraph(para: any, index: number): Block | null {
    // Determine block type
    let blockType: Block['type'] = 'paragraph';
    if (para.style) {
      const style = para.style.toLowerCase();
      if (style.includes('heading1') || style.includes('heading 1')) {
        blockType = 'heading1';
      } else if (style.includes('heading2') || style.includes('heading 2')) {
        blockType = 'heading2';
      } else if (style.includes('heading3') || style.includes('heading 3')) {
        blockType = 'heading3';
      }
    }

    // Extract text and runs
    let text = para.text || '';
    const runs: TextRun[] = [];

    if (Array.isArray(para.runs) && para.runs.length > 0) {
      para.runs.forEach((run: any) => {
        const runText = run.text || '';
        if (runText) {
          runs.push({
            text: runText,
            formatting: this.extractFormatting(run)
          });
        }
      });
      // Concatenate all run texts
      text = runs.map(r => r.text).join('');
    }

    // If no runs, create a single run with paragraph-level formatting
    if (runs.length === 0 && text) {
      runs.push({
        text,
        formatting: this.extractFormatting(para)
      });
    }

    // Skip empty paragraphs
    if (!text.trim()) {
      return null;
    }

    return {
      id: this.generateBlockId(text, index),
      type: blockType,
      text,
      runs,
      formatting: this.extractFormatting(para)
    };
  }

  private normalizeTable(table: any, index: number): Block | null {
    // For MVP, extract table as text
    let text = '';

    if (Array.isArray(table.rows)) {
      table.rows.forEach((row: any) => {
        if (Array.isArray(row.cells)) {
          const cellTexts = row.cells.map((cell: any) => cell.text || '').filter((t: string) => t.trim());
          if (cellTexts.length > 0) {
            text += cellTexts.join(' | ') + '\n';
          }
        }
      });
    }

    if (!text.trim()) {
      return null;
    }

    return {
      id: this.generateBlockId(text, index),
      type: 'table',
      text: text.trim(),
      runs: [
        {
          text: text.trim(),
          formatting: {}
        }
      ],
      formatting: {}
    };
  }

  private extractFormatting(item: any): TextFormatting {
    const formatting: TextFormatting = {};

    if (item.bold === true) formatting.bold = true;
    if (item.italic === true) formatting.italic = true;
    if (item.underline === true) formatting.underline = true;
    if (item.color) formatting.color = item.color;
    if (item.font) formatting.font = item.font;
    if (item.fontSize) formatting.fontSize = item.fontSize;

    return formatting;
  }

  private generateBlockId(text: string, index: number): string {
    // Generate a simple hash-based ID for block identification
    const textHash = this.simpleHash(text.substring(0, 100));
    return `block-${index}-${textHash}`;
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  terminate() {
    // No-op for compatibility with old API
  }
}
