// DOCX Export - Generate redlined Word document with track changes and comments

import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  UnderlineType,
  PageBreak,
  CommentRangeStart,
  CommentRangeEnd,
  Packer
} from 'docx';
import type { DocumentDiff, BlockDiff } from '../types/diff.types';
import type { Block, TextFormatting, SectionProperties } from '../types/ast.types';

export class DocxExporter {
  async export(
    diff: DocumentDiff,
    originalFileName: string,
    _currentFileName: string
  ): Promise<void> {
    // Generate DOCX with track changes
    const doc = this.createDocumentWithTrackChanges(diff);

    // Generate blob and download
    const blob = await Packer.toBlob(doc);
    this.downloadBlob(blob, `${this.getBaseName(originalFileName)}_redlined.docx`);
  }

  private createDocumentWithTrackChanges(diff: DocumentDiff): Document {
    const paragraphs: Paragraph[] = [];
    const comments: any[] = [];
    let commentId = 1;

    diff.blockDiffs.forEach((blockDiff) => {
      const result = this.renderBlockDiff(blockDiff, commentId);
      paragraphs.push(...result.paragraphs);
      comments.push(...result.comments);
      commentId = result.nextCommentId;
    });

    // Build section properties including columns
    const sectionProps = this.buildSectionProperties(diff.sectionProperties);

    // Build document options
    const docOptions: any = {
      sections: [{
        properties: sectionProps,
        children: paragraphs
      }]
    };

    // Add comments if any exist
    if (comments.length > 0) {
      docOptions.comments = {
        children: comments
      };
    }

    return new Document(docOptions);
  }

  private buildSectionProperties(sectionProperties?: SectionProperties): any {
    const props: any = {};

    if (sectionProperties?.columnCount && sectionProperties.columnCount > 1) {
      // Default space between columns is ~0.5 inch = 720 twips if not specified
      const spaceInTwips = sectionProperties.columnSpace || 720;

      props.column = {
        count: sectionProperties.columnCount,
        space: spaceInTwips,
        equalWidth: true
      };
    }

    return props;
  }

  private renderBlockDiff(blockDiff: BlockDiff, startCommentId: number): {
    paragraphs: Paragraph[],
    comments: any[],
    nextCommentId: number
  } {
    switch (blockDiff.type) {
      case 'unchanged':
        // Render block as-is (no track changes)
        return this.renderUnchangedBlock(blockDiff.currentBlock!, startCommentId);

      case 'insert':
        // Entire block inserted
        return this.renderInsertedBlock(blockDiff.currentBlock!, startCommentId);

      case 'delete':
        // Entire block deleted
        return this.renderDeletedBlock(blockDiff.originalBlock!, startCommentId);

      case 'modify':
        // Word-level changes within block
        return this.renderModifiedBlock(blockDiff, startCommentId);

      default:
        return { paragraphs: [], comments: [], nextCommentId: startCommentId };
    }
  }

  private renderUnchangedBlock(block: Block, startCommentId: number): {
    paragraphs: Paragraph[],
    comments: any[],
    nextCommentId: number
  } {
    // Special handling for page breaks
    if (block.type === 'page-break') {
      return {
        paragraphs: [new Paragraph({ children: [new PageBreak()] })],
        comments: [],
        nextCommentId: startCommentId
      };
    }

    // Render paragraph with original formatting, no track changes
    const runs = block.runs.map(run => this.createTextRun(run.text, run.formatting));

    const paragraph = new Paragraph({
      children: runs,
      heading: this.getHeadingLevel(block.type),
      spacing: { after: 200 }
    });

    return { paragraphs: [paragraph], comments: [], nextCommentId: startCommentId };
  }

  private renderInsertedBlock(block: Block, commentId: number): {
    paragraphs: Paragraph[],
    comments: any[],
    nextCommentId: number
  } {
    // Special handling for page breaks
    if (block.type === 'page-break') {
      return {
        paragraphs: [new Paragraph({ children: [new PageBreak()] })],
        comments: [],
        nextCommentId: commentId
      };
    }

    // Create comment for insertion
    const comment = {
      id: commentId,
      author: "Document Comparison",
      date: new Date(),
      children: [
        new Paragraph({
          children: [
            new TextRun({ text: `Added: New ${block.type}` })
          ]
        })
      ]
    };

    // Create paragraph with track changes (insertion)
    const runs = block.runs.map(run =>
      new TextRun({
        text: run.text,
        bold: run.formatting.bold,
        italics: run.formatting.italic,
        underline: { type: UnderlineType.SINGLE }, // Always underline insertions
        color: run.formatting.color || "2F5496", // Blue color for insertions
        font: run.formatting.font,
        size: run.formatting.fontSize ? run.formatting.fontSize * 2 : undefined, // Half-points
        highlight: "yellow" // Yellow highlight for visibility
      })
    );

    // Add comment range markers
    const paragraph = new Paragraph({
      children: [
        new CommentRangeStart(commentId),
        ...runs,
        new CommentRangeEnd(commentId)
      ],
      heading: this.getHeadingLevel(block.type),
      spacing: { after: 200 }
    });

    return {
      paragraphs: [paragraph],
      comments: [comment],
      nextCommentId: commentId + 1
    };
  }

  private renderDeletedBlock(block: Block, commentId: number): {
    paragraphs: Paragraph[],
    comments: any[],
    nextCommentId: number
  } {
    // Special handling for page breaks
    if (block.type === 'page-break') {
      // Don't render deleted page breaks
      return {
        paragraphs: [],
        comments: [],
        nextCommentId: commentId
      };
    }

    // Create comment for deletion
    const comment = {
      id: commentId,
      author: "Document Comparison",
      date: new Date(),
      children: [
        new Paragraph({
          children: [
            new TextRun({ text: `Removed: Deleted ${block.type}` })
          ]
        })
      ]
    };

    // Create paragraph with track changes (deletion/strikethrough)
    const runs = block.runs.map(run =>
      new TextRun({
        text: run.text,
        bold: run.formatting.bold,
        italics: run.formatting.italic,
        strike: true,  // Strikethrough for deletions
        color: run.formatting.color || "FF0000", // Red if no color
        font: run.formatting.font,
        size: run.formatting.fontSize ? run.formatting.fontSize * 2 : undefined
      })
    );

    const paragraph = new Paragraph({
      children: [
        new CommentRangeStart(commentId),
        ...runs,
        new CommentRangeEnd(commentId)
      ],
      heading: this.getHeadingLevel(block.type),
      spacing: { after: 200 }
    });

    return {
      paragraphs: [paragraph],
      comments: [comment],
      nextCommentId: commentId + 1
    };
  }

  private renderModifiedBlock(blockDiff: BlockDiff, commentId: number): {
    paragraphs: Paragraph[],
    comments: any[],
    nextCommentId: number
  } {
    const runs: (TextRun | CommentRangeStart | CommentRangeEnd)[] = [];
    const comments: any[] = [];
    let currentCommentId = commentId;

    // Process word-level diffs
    blockDiff.wordDiff!.forEach((change) => {
      if (change.added) {
        // Insertion
        const comment = {
          id: currentCommentId,
          author: "Document Comparison",
          date: new Date(),
          children: [
            new Paragraph({
              children: [new TextRun({ text: `Added: "${change.value}"` })]
            })
          ]
        };
        comments.push(comment);

        runs.push(new CommentRangeStart(currentCommentId));
        runs.push(new TextRun({
          text: change.value,
          bold: blockDiff.currentBlock!.formatting.bold,
          italics: blockDiff.currentBlock!.formatting.italic,
          underline: { type: UnderlineType.SINGLE }, // Word insertion style
          color: "2F5496", // Blue color for insertions
          highlight: "yellow" // Yellow highlight for visibility
        }));
        runs.push(new CommentRangeEnd(currentCommentId));
        currentCommentId++;

      } else if (change.removed) {
        // Deletion
        const comment = {
          id: currentCommentId,
          author: "Document Comparison",
          date: new Date(),
          children: [
            new Paragraph({
              children: [new TextRun({ text: `Removed: "${change.value}"` })]
            })
          ]
        };
        comments.push(comment);

        runs.push(new CommentRangeStart(currentCommentId));
        runs.push(new TextRun({
          text: change.value,
          strike: true,
          color: "FF0000"
        }));
        runs.push(new CommentRangeEnd(currentCommentId));
        currentCommentId++;

      } else {
        // Unchanged text
        runs.push(new TextRun({
          text: change.value,
          bold: blockDiff.currentBlock!.formatting.bold,
          italics: blockDiff.currentBlock!.formatting.italic,
          underline: blockDiff.currentBlock!.formatting.underline ? { type: UnderlineType.SINGLE } : undefined,
          color: blockDiff.currentBlock!.formatting.color,
          font: blockDiff.currentBlock!.formatting.font,
          size: blockDiff.currentBlock!.formatting.fontSize ? blockDiff.currentBlock!.formatting.fontSize * 2 : undefined
        }));
      }
    });

    const paragraph = new Paragraph({
      children: runs,
      heading: this.getHeadingLevel(blockDiff.currentBlock!.type),
      spacing: { after: 200 }
    });

    return {
      paragraphs: [paragraph],
      comments: comments,
      nextCommentId: currentCommentId
    };
  }

  private createTextRun(text: string, formatting: TextFormatting): TextRun {
    return new TextRun({
      text: text,
      bold: formatting.bold,
      italics: formatting.italic,
      underline: formatting.underline ? { type: UnderlineType.SINGLE } : undefined,
      color: formatting.color,
      font: formatting.font,
      size: formatting.fontSize ? formatting.fontSize * 2 : undefined // Word uses half-points
    });
  }

  private getHeadingLevel(blockType: string): typeof HeadingLevel[keyof typeof HeadingLevel] | undefined {
    switch (blockType) {
      case 'heading1': return HeadingLevel.HEADING_1;
      case 'heading2': return HeadingLevel.HEADING_2;
      case 'heading3': return HeadingLevel.HEADING_3;
      default: return undefined;
    }
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
