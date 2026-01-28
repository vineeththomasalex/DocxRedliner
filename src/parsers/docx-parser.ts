// DOCX Parser - Direct parsing in main thread using officeparser browser bundle

import type { DocumentAST, Block, TextRun, TextFormatting, SectionProperties } from '../types/ast.types';
import JSZip from 'jszip';

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

    // Extract section properties directly from DOCX XML
    const sectionProperties = await this.extractSectionProperties(buffer);

    // Normalize the result to our AST format
    const ast = this.normalizeAST(result);
    ast.sectionProperties = sectionProperties;
    return ast;
  }

  private async extractSectionProperties(buffer: ArrayBuffer): Promise<SectionProperties> {
    try {
      const zip = await JSZip.loadAsync(buffer);
      const documentXml = await zip.file('word/document.xml')?.async('string');

      if (!documentXml) {
        return {};
      }

      // Parse the XML
      const parser = new DOMParser();
      const doc = parser.parseFromString(documentXml, 'application/xml');

      // Find section properties (w:sectPr) - look for the last one which applies to the document body
      const sectPrElements = doc.getElementsByTagName('w:sectPr');
      if (sectPrElements.length === 0) {
        return {};
      }

      // Get the last sectPr (document-level section properties)
      const sectPr = sectPrElements[sectPrElements.length - 1];

      // Find columns element (w:cols)
      const colsElements = sectPr.getElementsByTagName('w:cols');
      if (colsElements.length === 0) {
        return {};
      }

      const cols = colsElements[0];
      const numAttr = cols.getAttribute('w:num');
      const spaceAttr = cols.getAttribute('w:space');

      const sectionProps: SectionProperties = {};

      if (numAttr) {
        sectionProps.columnCount = parseInt(numAttr, 10);
      }

      if (spaceAttr) {
        sectionProps.columnSpace = parseInt(spaceAttr, 10);
      }

      return sectionProps;
    } catch (error) {
      console.warn('Failed to extract section properties:', error);
      return {};
    }
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
        // Log item types for investigation
        if (item.type && item.type !== 'paragraph' && item.type !== 'heading' && item.type !== 'table') {
          console.log(`[DocxParser] Unhandled item type at index ${index}:`, item.type, item);
        }

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
        } else if (item.type === 'page-break' || item.type === 'break') {
          // Create page break block
          blocks.push({
            id: `page-break-${index}`,
            type: 'page-break',
            text: '',
            runs: [],
            formatting: {}
          });
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
      // Concatenate all run texts with whitespace normalization
      text = runs.map(r => r.text).join('').trim().replace(/\s+/g, ' ');
    }

    // If no runs, create a single run with paragraph-level formatting
    if (runs.length === 0 && text) {
      // Normalize text before creating run
      const normalizedText = text.trim().replace(/\s+/g, ' ');
      runs.push({
        text: normalizedText,
        formatting: this.extractFormatting(para)
      });
      text = normalizedText;
    }

    // Skip empty paragraphs
    if (!text.trim()) {
      return null;
    }

    return {
      id: this.generateBlockId(text, index),
      type: blockType,
      text: text.trim().replace(/\s+/g, ' '),
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

    const normalizedText = text.trim().replace(/\s+/g, ' ');
    return {
      id: this.generateBlockId(normalizedText, index),
      type: 'table',
      text: normalizedText,
      runs: [
        {
          text: normalizedText,
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
