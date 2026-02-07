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

    // Extract numbered list content that officeparser misses (paragraphs with <w:numPr>)
    const numberedListBlocks = await this.extractNumberedLists(buffer);

    // Merge numbered list blocks with existing blocks
    if (numberedListBlocks.length > 0) {
      ast.blocks = this.mergeBlocks(ast.blocks, numberedListBlocks);
    }

    // Extract tables directly from XML (row-level blocks for better diffing)
    // Reset table counter for each document to ensure consistent IDs
    this.tableCounter = 0;
    const tableBlocks = await this.extractTables(buffer);

    // Merge table-row blocks with existing blocks (removing old table blocks)
    if (tableBlocks.length > 0) {
      ast.blocks = this.mergeTableBlocks(ast.blocks, tableBlocks);
    }

    return ast;
  }

  /**
   * Merge table-row blocks with existing blocks, replacing old 'table' type blocks
   * with individual row blocks for better diffing.
   */
  private mergeTableBlocks(existingBlocks: Block[], tableBlocks: { block: Block; xmlIndex: number }[]): Block[] {
    if (tableBlocks.length === 0) {
      return existingBlocks;
    }

    // Remove any 'table' type blocks from existing blocks (they'll be replaced by table-row blocks)
    const nonTableBlocks = existingBlocks.filter(b => b.type !== 'table');

    // Sort table blocks by their XML index
    const sortedTableBlocks = [...tableBlocks].sort((a, b) => a.xmlIndex - b.xmlIndex);

    // For simplicity, append table-row blocks in their document order
    // A more sophisticated approach would interleave based on xmlIndex
    // but this works well for most documents
    const result: Block[] = [];

    // Create a set of table row texts for deduplication
    const tableTexts = new Set(sortedTableBlocks.map(tb => tb.block.text.toLowerCase().trim()));

    // Add non-table blocks, filtering out any that match table content
    for (const block of nonTableBlocks) {
      if (!tableTexts.has(block.text.toLowerCase().trim())) {
        result.push(block);
      }
    }

    // Find insertion point for table blocks (where tables originally were)
    // For now, add all table rows after existing non-table content
    // TODO: Could improve by tracking table position in document
    for (const tb of sortedTableBlocks) {
      result.push(tb.block);
    }

    // Regenerate IDs to ensure proper ordering
    return result.map((block, index) => ({
      ...block,
      id: this.generateBlockId(block.text, index)
    }));
  }

  private tableCounter = 0;

  /**
   * Extract tables directly from DOCX XML.
   * Creates one block per table row (type: 'table-row') with tableId linking rows.
   * This provides row-level diffing instead of flattening entire tables.
   */
  private async extractTables(buffer: ArrayBuffer): Promise<{ block: Block; xmlIndex: number }[]> {
    try {
      const zip = await JSZip.loadAsync(buffer);
      const documentXml = await zip.file('word/document.xml')?.async('string');

      if (!documentXml) {
        return [];
      }

      const parser = new DOMParser();
      const doc = parser.parseFromString(documentXml, 'application/xml');

      const tableBlocks: { block: Block; xmlIndex: number }[] = [];
      const tblElements = doc.getElementsByTagName('w:tbl');

      // We need to find position of tables relative to paragraphs
      // Get all body children to determine ordering
      const bodyElement = doc.getElementsByTagName('w:body')[0];
      if (!bodyElement) {
        return [];
      }

      // Build index of all elements for positioning
      const bodyChildren = Array.from(bodyElement.children);
      let globalIndex = 0;

      for (let tblIndex = 0; tblIndex < tblElements.length; tblIndex++) {
        const tbl = tblElements[tblIndex];
        const tableId = `table-${this.tableCounter++}`;

        // Find position of this table in the document body
        const tablePosition = bodyChildren.indexOf(tbl);

        // Extract all rows from this table
        const trElements = tbl.getElementsByTagName('w:tr');

        for (let rowIdx = 0; rowIdx < trElements.length; rowIdx++) {
          const tr = trElements[rowIdx];
          const cellTexts: string[] = [];

          // Extract text from all cells in this row
          const tcElements = tr.getElementsByTagName('w:tc');
          for (let cellIdx = 0; cellIdx < tcElements.length; cellIdx++) {
            const tc = tcElements[cellIdx];
            const cellText = this.extractTextFromTableCell(tc);
            cellTexts.push(cellText);
          }

          // Join cells with ' | ' separator
          const rowText = cellTexts.join(' | ').trim();

          if (rowText) {
            const formatting = this.extractFormattingFromTableRow(tr);
            const normalizedText = rowText.replace(/\s+/g, ' ');

            tableBlocks.push({
              block: {
                id: this.generateBlockId(normalizedText, 2000 + globalIndex),
                type: 'table-row',
                text: normalizedText,
                runs: [{ text: normalizedText, formatting }],
                formatting,
                tableId,
                rowIndex: rowIdx
              },
              // Use table position for ordering
              xmlIndex: tablePosition >= 0 ? tablePosition * 100 + rowIdx : 2000 + globalIndex
            });
            globalIndex++;
          }
        }
      }

      return tableBlocks;
    } catch (error) {
      console.warn('Failed to extract tables:', error);
      return [];
    }
  }

  /**
   * Extract text content from a table cell (<w:tc>) element
   */
  private extractTextFromTableCell(tc: Element): string {
    const textElements = tc.getElementsByTagName('w:t');
    let text = '';
    for (let i = 0; i < textElements.length; i++) {
      text += textElements[i].textContent || '';
    }
    return text.trim();
  }

  /**
   * Extract formatting from a table row by examining <w:rPr> elements
   */
  private extractFormattingFromTableRow(tr: Element): TextFormatting {
    const formatting: TextFormatting = {};

    // Check for bold
    const boldElements = tr.getElementsByTagName('w:b');
    if (boldElements.length > 0) {
      const val = boldElements[0].getAttribute('w:val');
      if (val === null || val === '' || val === 'true' || val === '1') {
        formatting.bold = true;
      }
    }

    // Check for italic
    const italicElements = tr.getElementsByTagName('w:i');
    if (italicElements.length > 0) {
      const val = italicElements[0].getAttribute('w:val');
      if (val === null || val === '' || val === 'true' || val === '1') {
        formatting.italic = true;
      }
    }

    return formatting;
  }

  /**
   * Extract content from paragraphs with Word native numbered lists (<w:numPr>).
   * officeparser skips these, so we need to extract them directly from the DOCX XML.
   */
  private async extractNumberedLists(buffer: ArrayBuffer): Promise<{ block: Block; xmlIndex: number }[]> {
    try {
      const zip = await JSZip.loadAsync(buffer);
      const documentXml = await zip.file('word/document.xml')?.async('string');

      if (!documentXml) {
        return [];
      }

      const parser = new DOMParser();
      const doc = parser.parseFromString(documentXml, 'application/xml');

      const numberedBlocks: { block: Block; xmlIndex: number }[] = [];
      const pElements = doc.getElementsByTagName('w:p');

      for (let i = 0; i < pElements.length; i++) {
        const p = pElements[i];
        const numPr = p.getElementsByTagName('w:numPr');

        if (numPr.length > 0) {
          // This paragraph has native numbering - extract its content
          const text = this.extractTextFromParagraph(p);

          if (text.trim()) {
            const formatting = this.extractFormattingFromParagraph(p);
            const normalizedText = text.trim().replace(/\s+/g, ' ');

            numberedBlocks.push({
              block: {
                id: this.generateBlockId(normalizedText, 1000 + i), // Use high index to avoid collisions
                type: 'paragraph',
                text: normalizedText,
                runs: [{ text: normalizedText, formatting }],
                formatting
              },
              xmlIndex: i
            });
          }
        }
      }

      return numberedBlocks;
    } catch (error) {
      console.warn('Failed to extract numbered lists:', error);
      return [];
    }
  }

  /**
   * Extract text content from a <w:p> element by concatenating all <w:t> elements
   */
  private extractTextFromParagraph(p: Element): string {
    const textElements = p.getElementsByTagName('w:t');
    let text = '';
    for (let i = 0; i < textElements.length; i++) {
      text += textElements[i].textContent || '';
    }
    return text;
  }

  /**
   * Extract formatting from a <w:p> element by examining <w:rPr> elements
   */
  private extractFormattingFromParagraph(p: Element): TextFormatting {
    const formatting: TextFormatting = {};

    // Check for bold
    const boldElements = p.getElementsByTagName('w:b');
    if (boldElements.length > 0) {
      const val = boldElements[0].getAttribute('w:val');
      // In DOCX, <w:b/> or <w:b w:val="true"/> means bold, <w:b w:val="false"/> means not bold
      if (val === null || val === '' || val === 'true' || val === '1') {
        formatting.bold = true;
      }
    }

    // Check for italic
    const italicElements = p.getElementsByTagName('w:i');
    if (italicElements.length > 0) {
      const val = italicElements[0].getAttribute('w:val');
      if (val === null || val === '' || val === 'true' || val === '1') {
        formatting.italic = true;
      }
    }

    // Check for underline
    const underlineElements = p.getElementsByTagName('w:u');
    if (underlineElements.length > 0) {
      const val = underlineElements[0].getAttribute('w:val');
      if (val && val !== 'none') {
        formatting.underline = true;
      }
    }

    return formatting;
  }

  /**
   * Merge numbered list blocks with existing blocks from officeparser.
   * This inserts numbered list content at the correct positions based on XML order.
   */
  private mergeBlocks(existingBlocks: Block[], numberedBlocks: { block: Block; xmlIndex: number }[]): Block[] {
    if (numberedBlocks.length === 0) {
      return existingBlocks;
    }

    // If there are no existing blocks, just return the numbered blocks in order
    if (existingBlocks.length === 0) {
      return numberedBlocks.map(nb => nb.block);
    }

    // Create a set of existing block texts for deduplication
    const existingTexts = new Set(existingBlocks.map(b => b.text.toLowerCase().trim()));

    // Filter out numbered blocks that are already in the existing blocks (deduplication)
    const newNumberedBlocks = numberedBlocks.filter(
      nb => !existingTexts.has(nb.block.text.toLowerCase().trim())
    );

    if (newNumberedBlocks.length === 0) {
      return existingBlocks;
    }

    // Sort numbered blocks by their XML index
    newNumberedBlocks.sort((a, b) => a.xmlIndex - b.xmlIndex);

    // Strategy: Insert numbered blocks based on their relative position
    // We'll create position markers by finding nearby non-numbered content

    // For now, use a simpler approach: interleave based on content position
    // Since numbered blocks come from XML order and existing blocks preserve document order,
    // we can merge them by creating a combined list

    const result: Block[] = [];
    let existingIdx = 0;
    let numberedIdx = 0;

    // Merge in order - numbered blocks typically appear between regular paragraphs
    // We use a heuristic: insert numbered blocks before the existing block
    // that comes after them in the XML (based on position)

    while (existingIdx < existingBlocks.length || numberedIdx < newNumberedBlocks.length) {
      // Add any numbered blocks that should come before the current existing block
      while (numberedIdx < newNumberedBlocks.length) {
        // If we've exhausted existing blocks, add remaining numbered blocks
        if (existingIdx >= existingBlocks.length) {
          result.push(newNumberedBlocks[numberedIdx].block);
          numberedIdx++;
          continue;
        }

        // For the simple case, interleave by adding numbered blocks
        // then existing blocks alternately based on xmlIndex
        const numberedXmlIndex = newNumberedBlocks[numberedIdx].xmlIndex;

        // Heuristic: numbered blocks with lower xmlIndex come first
        // Add the numbered block if its index suggests it comes before other content
        if (numberedIdx === 0 || numberedXmlIndex < (existingIdx + numberedIdx) * 2) {
          result.push(newNumberedBlocks[numberedIdx].block);
          numberedIdx++;
        } else {
          break;
        }
      }

      // Add the current existing block
      if (existingIdx < existingBlocks.length) {
        result.push(existingBlocks[existingIdx]);
        existingIdx++;
      }
    }

    // Regenerate IDs to ensure proper ordering
    return result.map((block, index) => ({
      ...block,
      id: this.generateBlockId(block.text, index)
    }));
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
