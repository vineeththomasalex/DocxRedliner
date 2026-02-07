// Diff Renderer - Renders redlined comparison with highlighting

import type { DocumentDiff, BlockDiff, GroupedChange, PhraseReplacement } from '../types/diff.types';
import type { TextFormatting, SectionProperties } from '../types/ast.types';

export class DiffRenderer {
  private redlinedPane: HTMLElement;
  private changeElements: HTMLElement[] = [];

  constructor(redlinedPaneId: string) {
    const pane = document.getElementById(redlinedPaneId);

    if (!pane) {
      throw new Error('Redlined pane not found');
    }

    this.redlinedPane = pane;
  }

  renderRedlined(diff: DocumentDiff) {
    this.changeElements = [];
    const blocks: string[] = [];

    diff.blockDiffs.forEach((blockDiff) => {
      blocks.push(this.renderRedlinedBlock(blockDiff));
    });

    // Apply column styling if document has multiple columns
    this.applyColumnStyling(this.redlinedPane, diff.sectionProperties);

    this.redlinedPane.innerHTML = blocks.join('');
    this.collectChangeElements();
  }

  private applyColumnStyling(pane: HTMLElement, sectionProperties?: SectionProperties) {
    if (sectionProperties?.columnCount && sectionProperties.columnCount > 1) {
      // Convert twips to pixels (1 twip = 1/1440 inch, assume 96 DPI)
      const spaceInPx = sectionProperties.columnSpace
        ? Math.round((sectionProperties.columnSpace / 1440) * 96)
        : 24; // default ~0.25 inch gap

      pane.style.columnCount = String(sectionProperties.columnCount);
      pane.style.columnGap = `${spaceInPx}px`;
    } else {
      // Reset column styling
      pane.style.columnCount = '';
      pane.style.columnGap = '';
    }
  }

  private renderRedlinedBlock(blockDiff: BlockDiff): string {
    const changeClass = blockDiff.changeId ? ` data-change-id="${blockDiff.changeId}"` : '';

    switch (blockDiff.type) {
      case 'insert':
        // Show inserted block with highlight
        return this.renderBlock(blockDiff.currentBlock!, 'inserted', changeClass);

      case 'delete':
        // Show deleted block with strikethrough
        return this.renderBlock(blockDiff.originalBlock!, 'deleted', changeClass);

      case 'modify':
        // Show merged block with inline changes
        return this.renderRedlinedModifiedBlock(blockDiff, changeClass);

      case 'unchanged':
        // Show unchanged block normally
        return this.renderBlock(blockDiff.currentBlock!, 'unchanged', '');

      default:
        return '';
    }
  }

  private renderBlock(block: any, state: 'inserted' | 'deleted' | 'unchanged', changeClass: string): string {
    // Special handling for page breaks
    if (block.type === 'page-break') {
      const blockClass = state === 'inserted' ? 'block-inserted' :
                        state === 'deleted' ? 'block-deleted' :
                        'block-unchanged';
      return `<div class="block block-page-break ${blockClass}"${changeClass}>
        <div class="page-break-indicator">
          <span>─────── Page Break ───────</span>
        </div>
      </div>`;
    }

    const blockClass = state === 'inserted' ? 'block-inserted' :
                      state === 'deleted' ? 'block-deleted' :
                      'block-unchanged';

    const typeClass = `para-${block.type}`;

    // Render runs with their formatting
    let content = '';
    if (block.runs && block.runs.length > 0) {
      content = block.runs.map((run: any) =>
        this.renderFormattedText(run.text, run.formatting)
      ).join('');
    } else {
      content = this.escapeHtml(block.text);
    }

    return `<div class="block ${blockClass} ${typeClass}"${changeClass}>${content}</div>`;
  }

  private renderRedlinedModifiedBlock(blockDiff: BlockDiff, changeClass: string): string {
    // Prefer groupedDiff if available, fall back to wordDiff
    const changes = blockDiff.groupedDiff || blockDiff.wordDiff;
    if (!changes) {
      return this.renderBlock(blockDiff.currentBlock!, 'unchanged', changeClass);
    }

    const block = blockDiff.currentBlock!;
    const origBlock = blockDiff.originalBlock!;
    const typeClass = `para-${block.type}`;
    let html = `<div class="block block-modified ${typeClass}"${changeClass}>`;

    // Render changes with formatting preserved
    for (const change of changes) {
      if (this.isPhraseReplacement(change)) {
        // Render phrase replacement: deleted text followed by inserted text
        const deletedFormatted = this.renderFormattedText(change.deletedText, origBlock.formatting);
        const insertedFormatted = this.renderFormattedText(change.insertedText, block.formatting);
        html += `<span class="diff-delete">${deletedFormatted}</span>`;
        html += `<span class="diff-insert">${insertedFormatted}</span>`;
      } else if (change.removed) {
        // Apply original block formatting to deleted text
        const formattedText = this.renderFormattedText(change.value, origBlock.formatting);
        html += `<span class="diff-delete">${formattedText}</span>`;
      } else if (change.added) {
        // Apply current block formatting to inserted text
        const formattedText = this.renderFormattedText(change.value, block.formatting);
        html += `<span class="diff-insert">${formattedText}</span>`;
      } else {
        // Unchanged text - apply current block formatting
        html += this.renderFormattedText(change.value, block.formatting);
      }
    }

    html += '</div>';
    return html;
  }

  /**
   * Type guard to check if a change is a PhraseReplacement
   */
  private isPhraseReplacement(change: GroupedChange): change is PhraseReplacement {
    return 'type' in change && change.type === 'phrase-replace';
  }

  private renderFormattedText(text: string, formatting: TextFormatting): string {
    let html = this.escapeHtml(text);

    // Apply formatting
    if (formatting.bold) {
      html = `<strong>${html}</strong>`;
    }
    if (formatting.italic) {
      html = `<em>${html}</em>`;
    }
    if (formatting.underline) {
      html = `<u>${html}</u>`;
    }

    // Apply styles
    const styles: string[] = [];
    if (formatting.color) {
      styles.push(`color: ${formatting.color}`);
    }
    if (formatting.font) {
      styles.push(`font-family: ${formatting.font}`);
    }
    if (formatting.fontSize) {
      styles.push(`font-size: ${formatting.fontSize}pt`);
    }

    if (styles.length > 0) {
      html = `<span style="${styles.join('; ')}">${html}</span>`;
    }

    return html;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private collectChangeElements() {
    this.changeElements = Array.from(
      this.redlinedPane.querySelectorAll('[data-change-id]')
    ) as HTMLElement[];
  }

  getChangeElements(): HTMLElement[] {
    return this.changeElements;
  }
}
