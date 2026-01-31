// In-Place DOCX Export - Modifies the current document to add track changes
// Preserves all original formatting (columns, fonts, styles, images, headers/footers)

import JSZip from 'jszip';
import type { DocumentDiff, BlockDiff } from '../types/diff.types';
import type { Block } from '../types/ast.types';

// XML namespaces used in DOCX
const NS = {
  w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  mc: 'http://schemas.openxmlformats.org/markup-compatibility/2006',
  w14: 'http://schemas.microsoft.com/office/word/2010/wordml',
  w15: 'http://schemas.microsoft.com/office/word/2012/wordml'
};

interface CommentData {
  id: number;
  text: string;
}

export class DocxInPlaceExporter {
  private zip: JSZip | null = null;
  private documentXml: Document | null = null;
  private comments: CommentData[] = [];
  private nextCommentId = 0;
  private nextRevisionId = 0;
  private author = 'Document Comparison';
  private date = new Date().toISOString();

  async export(
    diff: DocumentDiff,
    currentFileBuffer: ArrayBuffer,
    originalFileName: string
  ): Promise<void> {
    // Load the current DOCX file
    this.zip = await JSZip.loadAsync(currentFileBuffer);

    // Parse document.xml
    const documentXmlString = await this.zip.file('word/document.xml')?.async('string');
    if (!documentXmlString) {
      throw new Error('Invalid DOCX: missing word/document.xml');
    }

    const parser = new DOMParser();
    this.documentXml = parser.parseFromString(documentXmlString, 'application/xml');

    // Reset state
    this.comments = [];
    this.nextCommentId = 0;
    this.nextRevisionId = 0;
    this.date = new Date().toISOString();

    // Get all paragraphs from the document
    const paragraphs = Array.from(this.documentXml.getElementsByTagName('w:p'));

    // Process each block diff
    this.processBlockDiffs(diff.blockDiffs, paragraphs);

    // Update the document XML
    const serializer = new XMLSerializer();
    const updatedDocumentXml = serializer.serializeToString(this.documentXml);
    this.zip.file('word/document.xml', updatedDocumentXml);

    // Build and add comments.xml if we have comments
    if (this.comments.length > 0) {
      await this.addCommentsToZip();
    }

    // Generate and download the DOCX
    const blob = await this.zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    this.downloadBlob(blob, `${this.getBaseName(originalFileName)}_redlined.docx`);
  }

  private processBlockDiffs(blockDiffs: BlockDiff[], paragraphs: Element[]): void {
    // Track which paragraphs have been matched to avoid double-processing
    const matchedParagraphs = new Set<Element>();

    // First pass: match all non-deleted blocks to their paragraphs
    // This builds a map so we know where to insert deletions
    const blockToParagraph = new Map<BlockDiff, Element>();

    for (const blockDiff of blockDiffs) {
      if (blockDiff.type === 'delete') {
        continue; // Handle deletions in second pass
      }

      const block = blockDiff.currentBlock;
      if (!block || block.type === 'page-break') {
        continue;
      }

      const matchedPara = this.matchBlockToParagraph(block, paragraphs, matchedParagraphs);
      if (matchedPara) {
        matchedParagraphs.add(matchedPara);
        blockToParagraph.set(blockDiff, matchedPara);
      }
    }

    // Second pass: process all blocks in order, inserting deletions at correct positions
    for (let i = 0; i < blockDiffs.length; i++) {
      const blockDiff = blockDiffs[i];

      if (blockDiff.type === 'unchanged') {
        continue;
      }

      if (blockDiff.type === 'delete') {
        const block = blockDiff.originalBlock;
        if (!block || block.type === 'page-break') {
          continue;
        }

        // Find the next non-deleted block's paragraph to insert before
        let insertBefore: Element | null = null;
        for (let j = i + 1; j < blockDiffs.length; j++) {
          const nextDiff = blockDiffs[j];
          if (nextDiff.type !== 'delete') {
            insertBefore = blockToParagraph.get(nextDiff) || null;
            if (insertBefore) break;
          }
        }

        this.insertDeletedParagraph(block, insertBefore);
        continue;
      }

      // Handle insert and modify
      const matchedPara = blockToParagraph.get(blockDiff);
      if (!matchedPara) {
        continue;
      }

      const block = blockDiff.currentBlock!;

      switch (blockDiff.type) {
        case 'insert':
          this.markParagraphAsInserted(matchedPara, block);
          break;
        case 'modify':
          this.applyWordLevelChanges(matchedPara, blockDiff);
          break;
      }
    }
  }

  private matchBlockToParagraph(
    block: Block,
    paragraphs: Element[],
    matchedParagraphs: Set<Element>
  ): Element | null {
    const blockText = this.normalizeText(block.text);

    // First pass: exact match
    for (const para of paragraphs) {
      if (matchedParagraphs.has(para)) continue;

      const paraText = this.normalizeText(this.getParagraphText(para));
      if (paraText === blockText) {
        return para;
      }
    }

    // Second pass: fuzzy match (contains or starts with)
    for (const para of paragraphs) {
      if (matchedParagraphs.has(para)) continue;

      const paraText = this.normalizeText(this.getParagraphText(para));
      if (paraText.length > 0 && blockText.length > 0) {
        // Check if significant overlap
        if (paraText.includes(blockText) || blockText.includes(paraText)) {
          return para;
        }
        // Check if starts with same content (for modified paragraphs)
        const minLen = Math.min(paraText.length, blockText.length, 30);
        if (minLen > 10 && paraText.substring(0, minLen) === blockText.substring(0, minLen)) {
          return para;
        }
      }
    }

    return null;
  }

  private getParagraphText(para: Element): string {
    const textElements = para.getElementsByTagName('w:t');
    let text = '';
    for (let i = 0; i < textElements.length; i++) {
      text += textElements[i].textContent || '';
    }
    return text;
  }

  private normalizeText(text: string): string {
    return text.trim().replace(/\s+/g, ' ').toLowerCase();
  }

  private markParagraphAsInserted(para: Element, block: Block): void {
    // Add comment for this insertion
    const commentId = this.addComment(`Added: New ${block.type}`);

    // Get all runs in the paragraph
    const runs = Array.from(para.getElementsByTagName('w:r'));

    if (runs.length === 0) {
      return;
    }

    // Apply green underline formatting to all runs (no w:ins to avoid Word overriding colors)
    const firstRun = runs[0];

    // Insert comment range start before first run
    const commentStart = this.createCommentRangeStart(commentId);
    firstRun.parentNode?.insertBefore(commentStart, firstRun);

    // Apply insertion formatting to each run directly
    for (const run of runs) {
      this.applyInsertionFormatting(run);
    }

    // Add comment range end and reference after the last run
    const lastRun = runs[runs.length - 1];
    const commentEnd = this.createCommentRangeEnd(commentId);
    const commentRef = this.createCommentReference(commentId);
    lastRun.parentNode?.insertBefore(commentEnd, lastRun.nextSibling);
    commentEnd.parentNode?.insertBefore(commentRef, commentEnd.nextSibling);
  }

  private insertDeletedParagraph(block: Block, insertBefore: Element | null): void {
    const body = this.documentXml?.getElementsByTagName('w:body')[0];
    if (!body) return;

    // Add comment for this deletion
    const commentId = this.addComment(`Removed: Deleted ${block.type}`);

    // Create a new paragraph with deletion markup
    const newPara = this.documentXml!.createElementNS(NS.w, 'w:p');

    // Add comment range start
    newPara.appendChild(this.createCommentRangeStart(commentId));

    // Create del element with the deleted text
    const delElement = this.createDelElement();

    // Create run with deleted text
    const run = this.createRunWithText(block.text, true);
    delElement.appendChild(run);
    newPara.appendChild(delElement);

    // Add comment range end and reference
    newPara.appendChild(this.createCommentRangeEnd(commentId));
    newPara.appendChild(this.createCommentReference(commentId));

    // Insert at the correct position
    if (insertBefore) {
      // Insert before the next paragraph
      insertBefore.parentNode?.insertBefore(newPara, insertBefore);
    } else {
      // No following paragraph found, insert at end (before sectPr if present)
      const sectPr = body.getElementsByTagName('w:sectPr')[0];
      if (sectPr) {
        body.insertBefore(newPara, sectPr);
      } else {
        body.appendChild(newPara);
      }
    }
  }

  private applyWordLevelChanges(para: Element, blockDiff: BlockDiff): void {
    if (!blockDiff.wordDiff || blockDiff.wordDiff.length === 0) {
      return;
    }

    // Clear the paragraph content (keeping properties)
    const pPr = para.getElementsByTagName('w:pPr')[0];
    while (para.firstChild) {
      para.removeChild(para.firstChild);
    }
    if (pPr) {
      para.appendChild(pPr);
    }

    // Build new content based on word diff
    for (const change of blockDiff.wordDiff) {
      if (change.added) {
        // Insertion - use visual formatting only (no w:ins to avoid Word overriding colors)
        const commentId = this.addComment(`Added: "${change.value.trim()}"`);

        para.appendChild(this.createCommentRangeStart(commentId));

        // Create run with green underline formatting (no track change wrapper)
        const run = this.createRunWithText(change.value, false, true);
        para.appendChild(run);

        para.appendChild(this.createCommentRangeEnd(commentId));
        para.appendChild(this.createCommentReference(commentId));

      } else if (change.removed) {
        // Deletion
        const commentId = this.addComment(`Removed: "${change.value.trim()}"`);

        para.appendChild(this.createCommentRangeStart(commentId));

        const delElement = this.createDelElement();
        const run = this.createRunWithText(change.value, true);
        delElement.appendChild(run);
        para.appendChild(delElement);

        para.appendChild(this.createCommentRangeEnd(commentId));
        para.appendChild(this.createCommentReference(commentId));

      } else {
        // Unchanged text
        const run = this.createRunWithText(change.value, false, false);
        para.appendChild(run);
      }
    }
  }

  private createDelElement(): Element {
    const del = this.documentXml!.createElementNS(NS.w, 'w:del');
    del.setAttribute('w:id', String(this.nextRevisionId++));
    del.setAttribute('w:author', this.author);
    del.setAttribute('w:date', this.date);
    return del;
  }

  private createRunWithText(text: string, isDeleted: boolean, isInserted: boolean = false): Element {
    const run = this.documentXml!.createElementNS(NS.w, 'w:r');

    // Add run properties for formatting
    const rPr = this.documentXml!.createElementNS(NS.w, 'w:rPr');

    if (isDeleted) {
      // Red color and strikethrough for deletions
      const color = this.documentXml!.createElementNS(NS.w, 'w:color');
      color.setAttribute('w:val', 'FF0000');
      rPr.appendChild(color);

      const strike = this.documentXml!.createElementNS(NS.w, 'w:strike');
      rPr.appendChild(strike);
    } else if (isInserted) {
      // Yellow highlight for insertions (keeps normal text color)
      const highlight = this.documentXml!.createElementNS(NS.w, 'w:highlight');
      highlight.setAttribute('w:val', 'yellow');
      rPr.appendChild(highlight);
    }

    run.appendChild(rPr);

    // Add text element
    const textElement = this.documentXml!.createElementNS(NS.w, isDeleted ? 'w:delText' : 'w:t');
    // Preserve whitespace
    textElement.setAttribute('xml:space', 'preserve');
    textElement.textContent = text;
    run.appendChild(textElement);

    return run;
  }

  private applyInsertionFormatting(run: Element): void {
    // Get or create run properties
    let rPr = run.getElementsByTagName('w:rPr')[0];
    if (!rPr) {
      rPr = this.documentXml!.createElementNS(NS.w, 'w:rPr');
      run.insertBefore(rPr, run.firstChild);
    }

    // Add yellow highlight (keeps normal text color)
    let highlight = rPr.getElementsByTagName('w:highlight')[0];
    if (!highlight) {
      highlight = this.documentXml!.createElementNS(NS.w, 'w:highlight');
      rPr.appendChild(highlight);
    }
    highlight.setAttribute('w:val', 'yellow');
  }

  private createCommentRangeStart(commentId: number): Element {
    const el = this.documentXml!.createElementNS(NS.w, 'w:commentRangeStart');
    el.setAttribute('w:id', String(commentId));
    return el;
  }

  private createCommentRangeEnd(commentId: number): Element {
    const el = this.documentXml!.createElementNS(NS.w, 'w:commentRangeEnd');
    el.setAttribute('w:id', String(commentId));
    return el;
  }

  private createCommentReference(commentId: number): Element {
    const run = this.documentXml!.createElementNS(NS.w, 'w:r');
    const ref = this.documentXml!.createElementNS(NS.w, 'w:commentReference');
    ref.setAttribute('w:id', String(commentId));
    run.appendChild(ref);
    return run;
  }

  private addComment(text: string): number {
    const id = this.nextCommentId++;
    this.comments.push({ id, text });
    return id;
  }

  private async addCommentsToZip(): Promise<void> {
    // Build comments.xml
    const commentsXml = this.buildCommentsXml();
    this.zip!.file('word/comments.xml', commentsXml);

    // Update relationships
    await this.updateRelationships();

    // Update content types
    await this.updateContentTypes();
  }

  private buildCommentsXml(): string {
    const commentElements = this.comments.map(comment => `
    <w:comment w:id="${comment.id}" w:author="${this.author}" w:date="${this.date}">
      <w:p>
        <w:r>
          <w:t>${this.escapeXml(comment.text)}</w:t>
        </w:r>
      </w:p>
    </w:comment>`).join('');

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">
${commentElements}
</w:comments>`;
  }

  private async updateRelationships(): Promise<void> {
    const relsPath = 'word/_rels/document.xml.rels';
    let relsXml = await this.zip!.file(relsPath)?.async('string');

    if (!relsXml) {
      // Create basic relationships file
      relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`;
    }

    // Check if comments relationship already exists
    if (relsXml.includes('comments.xml')) {
      return;
    }

    // Find highest rId
    const rIdMatches = relsXml.match(/rId(\d+)/g) || [];
    let maxId = 0;
    for (const match of rIdMatches) {
      const id = parseInt(match.replace('rId', ''), 10);
      if (id > maxId) maxId = id;
    }
    const newRId = `rId${maxId + 1}`;

    // Add comments relationship
    const newRel = `<Relationship Id="${newRId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/>`;

    // Insert before closing tag
    relsXml = relsXml.replace('</Relationships>', `  ${newRel}\n</Relationships>`);

    this.zip!.file(relsPath, relsXml);
  }

  private async updateContentTypes(): Promise<void> {
    const contentTypesPath = '[Content_Types].xml';
    let contentTypesXml = await this.zip!.file(contentTypesPath)?.async('string');

    if (!contentTypesXml) {
      return;
    }

    // Check if comments content type already exists
    if (contentTypesXml.includes('/word/comments.xml')) {
      return;
    }

    // Add override for comments.xml
    const newOverride = `<Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>`;

    // Insert before closing tag
    contentTypesXml = contentTypesXml.replace('</Types>', `  ${newOverride}\n</Types>`);

    this.zip!.file(contentTypesPath, contentTypesXml);
  }

  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  private getBaseName(filename: string): string {
    return filename.replace(/\.(docx?|DOCX?)$/, '');
  }
}
