// Diff Renderer - Renders side-by-side comparison with highlighting

import type { DocumentDiff, BlockDiff } from '../types/diff.types';
import type { TextFormatting } from '../types/ast.types';

export class DiffRenderer {
  private leftPane: HTMLElement;
  private rightPane: HTMLElement;
  private redlinedPane: HTMLElement | null = null;
  private changeElements: HTMLElement[] = [];

  constructor(leftPaneId: string, rightPaneId: string) {
    const left = document.getElementById(leftPaneId);
    const right = document.getElementById(rightPaneId);

    if (!left || !right) {
      throw new Error('Panes not found');
    }

    this.leftPane = left;
    this.rightPane = right;

    // Add redlined pane reference
    const redlined = document.getElementById('pane-redlined-content');
    this.redlinedPane = redlined;
  }

  render(diff: DocumentDiff) {
    this.changeElements = [];

    const leftBlocks: string[] = [];
    const rightBlocks: string[] = [];

    diff.blockDiffs.forEach((blockDiff) => {
      const [leftHtml, rightHtml] = this.renderBlockDiff(blockDiff);
      leftBlocks.push(leftHtml);
      rightBlocks.push(rightHtml);
    });

    this.leftPane.innerHTML = leftBlocks.join('');
    this.rightPane.innerHTML = rightBlocks.join('');

    // Collect change elements for navigation
    this.collectChangeElements();
  }

  private renderBlockDiff(blockDiff: BlockDiff): [string, string] {
    const changeClass = blockDiff.changeId ? ` data-change-id="${blockDiff.changeId}"` : '';

    switch (blockDiff.type) {
      case 'insert':
        return [
          this.renderPlaceholder(),
          this.renderBlock(blockDiff.currentBlock!, 'inserted', changeClass)
        ];

      case 'delete':
        return [
          this.renderBlock(blockDiff.originalBlock!, 'deleted', changeClass),
          this.renderPlaceholder()
        ];

      case 'modify':
        return [
          this.renderModifiedBlock(blockDiff, 'original', changeClass),
          this.renderModifiedBlock(blockDiff, 'current', changeClass)
        ];

      case 'unchanged':
      default:
        return [
          this.renderBlock(blockDiff.originalBlock!, 'unchanged', ''),
          this.renderBlock(blockDiff.currentBlock!, 'unchanged', '')
        ];
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

    return `<div class="block ${blockClass} ${typeClass}"${changeClass}>
      ${this.escapeHtml(block.text)}
    </div>`;
  }

  private renderModifiedBlock(blockDiff: BlockDiff, side: 'original' | 'current', changeClass: string): string {
    if (!blockDiff.wordDiff || !blockDiff.formatDiff) {
      // Fallback to simple rendering
      const block = side === 'original' ? blockDiff.originalBlock : blockDiff.currentBlock;
      return this.renderBlock(block, 'unchanged', changeClass);
    }

    const block = side === 'original' ? blockDiff.originalBlock! : blockDiff.currentBlock!;
    const typeClass = `para-${block.type}`;

    let html = `<div class="block block-modified ${typeClass}"${changeClass}>`;

    // Render word diff with formatting
    blockDiff.wordDiff.forEach((change, idx) => {
      const formatChange = blockDiff.formatDiff![idx];

      if (side === 'original') {
        // Show deletions in original pane
        if (change.removed) {
          html += `<span class="diff-delete">${this.escapeHtml(change.value)}</span>`;
        } else if (!change.added) {
          // Unchanged or format change
          if (formatChange?.type === 'format-change') {
            html += this.renderFormattedText(change.value, formatChange.from, true);
          } else {
            html += this.renderFormattedText(change.value, block.formatting);
          }
        }
      } else {
        // Show insertions in current pane
        if (change.added) {
          html += `<span class="diff-insert">${this.escapeHtml(change.value)}</span>`;
        } else if (!change.removed) {
          // Unchanged or format change
          if (formatChange?.type === 'format-change') {
            html += this.renderFormattedText(change.value, formatChange.to, true, formatChange);
          } else {
            html += this.renderFormattedText(change.value, block.formatting);
          }
        }
      }
    });

    html += '</div>';
    return html;
  }

  private renderPlaceholder(): string {
    return '<div class="block block-placeholder">—</div>';
  }

  private renderFormattedText(text: string, formatting: TextFormatting, isFormatChange: boolean = false, formatChange?: any): string {
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

    // Add format change indicator
    if (isFormatChange && formatChange) {
      const tooltip = this.formatChangeTooltip(formatChange);
      html = `<span class="diff-format-change" title="${tooltip}">${html}</span>`;
    }

    return html;
  }

  private formatChangeTooltip(formatChange: any): string {
    const changes: string[] = [];
    Object.entries(formatChange.changes).forEach(([key, value]: [string, any]) => {
      const from = value.from === undefined ? 'none' : value.from;
      const to = value.to === undefined ? 'none' : value.to;
      changes.push(`${key}: ${from} → ${to}`);
    });
    return changes.join(', ');
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private collectChangeElements() {
    this.changeElements = Array.from(
      this.leftPane.querySelectorAll('[data-change-id]')
    ) as HTMLElement[];
  }

  getChangeElements(): HTMLElement[] {
    return this.changeElements;
  }

  renderRedlined(diff: DocumentDiff) {
    if (!this.redlinedPane) return;

    this.changeElements = [];
    const blocks: string[] = [];

    diff.blockDiffs.forEach((blockDiff) => {
      blocks.push(this.renderRedlinedBlock(blockDiff));
    });

    this.redlinedPane.innerHTML = blocks.join('');
    this.collectChangeElementsRedlined();
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

  private renderRedlinedModifiedBlock(blockDiff: BlockDiff, changeClass: string): string {
    if (!blockDiff.wordDiff) {
      return this.renderBlock(blockDiff.currentBlock!, 'unchanged', changeClass);
    }

    const block = blockDiff.currentBlock!;
    const typeClass = `para-${block.type}`;
    let html = `<div class="block block-modified ${typeClass}"${changeClass}>`;

    // Render word diffs: show deletions first, then insertions
    blockDiff.wordDiff.forEach((change) => {
      if (change.removed) {
        html += `<span class="diff-delete">${this.escapeHtml(change.value)}</span>`;
      } else if (change.added) {
        html += `<span class="diff-insert">${this.escapeHtml(change.value)}</span>`;
      } else {
        html += this.escapeHtml(change.value);
      }
    });

    html += '</div>';
    return html;
  }

  private collectChangeElementsRedlined() {
    if (!this.redlinedPane) return;
    this.changeElements = Array.from(
      this.redlinedPane.querySelectorAll('[data-change-id]')
    ) as HTMLElement[];
  }
}
