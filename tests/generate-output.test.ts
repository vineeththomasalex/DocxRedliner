import { describe, it, expect } from 'vitest';
import { readFile, writeFile } from 'fs/promises';
import { parseOffice } from 'officeparser';
import { DiffEngine } from '../src/diff/diff-engine';
import type { DocumentAST, Block, TextRun, TextFormatting } from '../src/types/ast.types';
import type { BlockDiff } from '../src/types/diff.types';
import path from 'path';

// Helper function to normalize officeparser output to our AST format
function normalizeToAST(result: any): DocumentAST {
  const blocks: Block[] = [];

  if (result.content && Array.isArray(result.content)) {
    result.content.forEach((item: any, index: number) => {
      if (item.type === 'paragraph' || item.type === 'heading') {
        const text = item.text || '';
        if (text.trim()) {
          const formatting: TextFormatting = {
            bold: item.bold,
            italic: item.italic,
            underline: item.underline,
            color: item.color,
            font: item.font,
            fontSize: item.fontSize
          };

          const runs: TextRun[] = item.runs?.map((run: any) => ({
            text: run.text || text,
            formatting: {
              bold: run.bold,
              italic: run.italic,
              underline: run.underline,
              color: run.color,
              font: run.font,
              fontSize: run.fontSize
            }
          })) || [{ text, formatting }];

          blocks.push({
            id: `block-${index}`,
            type: item.type === 'heading' ? 'heading1' : 'paragraph',
            text,
            runs,
            formatting
          });
        }
      }
    });
  }

  return {
    metadata: {
      author: result.author,
      title: result.title,
      created: result.created ? new Date(result.created) : undefined,
      modified: result.modified ? new Date(result.modified) : undefined
    },
    blocks
  };
}

// Simplified renderer for tests (without DOM)
function renderBlockDiff(blockDiff: BlockDiff): [string, string] {
  const changeClass = blockDiff.changeId ? ` data-change-id="${blockDiff.changeId}"` : '';

  function escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function renderBlock(block: any, state: 'inserted' | 'deleted' | 'unchanged', changeClass: string): string {
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

    return `<div class="block ${blockClass} ${typeClass}"${changeClass}>${escapeHtml(block.text)}</div>`;
  }

  function renderPlaceholder(): string {
    return '<div class="block block-placeholder">—</div>';
  }

  switch (blockDiff.type) {
    case 'insert':
      return [renderPlaceholder(), renderBlock(blockDiff.currentBlock!, 'inserted', changeClass)];
    case 'delete':
      return [renderBlock(blockDiff.originalBlock!, 'deleted', changeClass), renderPlaceholder()];
    case 'modify':
      return [
        renderModifiedBlock(blockDiff, 'original', changeClass, escapeHtml),
        renderModifiedBlock(blockDiff, 'current', changeClass, escapeHtml)
      ];
    case 'unchanged':
    default:
      return [
        renderBlock(blockDiff.originalBlock!, 'unchanged', ''),
        renderBlock(blockDiff.currentBlock!, 'unchanged', '')
      ];
  }
}

function renderModifiedBlock(blockDiff: BlockDiff, side: 'original' | 'current', changeClass: string, escapeHtml: (text: string) => string): string {
  if (!blockDiff.wordDiff) {
    const block = side === 'original' ? blockDiff.originalBlock : blockDiff.currentBlock;
    const blockClass = 'block-unchanged';
    const typeClass = `para-${block!.type}`;
    return `<div class="block ${blockClass} ${typeClass}"${changeClass}>${escapeHtml(block!.text)}</div>`;
  }

  const block = side === 'original' ? blockDiff.originalBlock! : blockDiff.currentBlock!;
  const typeClass = `para-${block.type}`;

  let html = `<div class="block block-modified ${typeClass}"${changeClass}>`;

  blockDiff.wordDiff.forEach((change) => {
    if (side === 'original') {
      if (change.removed) {
        html += `<span class="diff-delete">${escapeHtml(change.value)}</span>`;
      } else if (!change.added) {
        html += escapeHtml(change.value);
      }
    } else {
      if (change.added) {
        html += `<span class="diff-insert">${escapeHtml(change.value)}</span>`;
      } else if (!change.removed) {
        html += escapeHtml(change.value);
      }
    }
  });

  html += '</div>';
  return html;
}

function generateHtml(leftContent: string, rightContent: string, originalFileName: string, currentFileName: string, totalChanges: number): string {
  const styles = `
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  color: #24292f;
  background-color: #f6f8fa;
  line-height: 1.5;
}

.redliner-container {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.redliner-header {
  background: white;
  border-bottom: 1px solid #d0d7de;
  padding: 20px;
}

.redliner-header h1 {
  font-size: 24px;
  margin-bottom: 10px;
}

.file-info {
  display: flex;
  gap: 30px;
  font-size: 14px;
  color: #57606a;
  margin-top: 10px;
}

.comparison-panes {
  display: flex;
  flex: 1;
  overflow: hidden;
  background: white;
}

.pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.pane-header {
  padding: 12px 20px;
  background: #f6f8fa;
  border-bottom: 1px solid #d0d7de;
  font-weight: 600;
  font-size: 14px;
}

.pane-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.pane-divider {
  width: 1px;
  background: #d0d7de;
}

.block {
  margin-bottom: 16px;
  line-height: 1.6;
  padding: 8px 0;
}

.block-inserted {
  background-color: #dafbe1;
  border-left: 3px solid #2da44e;
  padding-left: 8px;
  padding-top: 8px;
  padding-bottom: 8px;
}

.block-deleted {
  background-color: #ffdce0;
  border-left: 3px solid #cf222e;
  padding-left: 8px;
  padding-top: 8px;
  padding-bottom: 8px;
}

.block-modified {
  padding-left: 8px;
}

.block-placeholder {
  background-color: #f6f8fa;
  color: #8c959f;
  padding: 8px;
  font-style: italic;
}

.diff-insert {
  background-color: #acf2bd;
  padding: 2px 4px;
  border-radius: 3px;
}

.diff-delete {
  background-color: #ffccd7;
  text-decoration: line-through;
  padding: 2px 4px;
  border-radius: 3px;
}

.para-heading1 {
  font-size: 24px;
  font-weight: 700;
  margin: 20px 0 12px 0;
}

.para-heading2 {
  font-size: 20px;
  font-weight: 700;
  margin: 16px 0 10px 0;
}

.para-paragraph {
  font-size: 14px;
  margin: 8px 0;
}

.block-page-break {
  margin: 20px 0;
  text-align: center;
  padding: 10px 0;
}

.page-break-indicator {
  color: #8c959f;
  font-size: 12px;
  font-style: italic;
  border-top: 2px dashed #d0d7de;
  border-bottom: 2px dashed #d0d7de;
  padding: 8px 0;
}

.block-page-break.block-inserted {
  background-color: #dafbe1;
  border-left: 3px solid #2da44e;
}

.block-page-break.block-deleted {
  background-color: #ffdce0;
  border-left: 3px solid #cf222e;
}

.change-summary {
  padding: 10px 20px;
  background: #ddf4ff;
  border-left: 3px solid #0969da;
  margin-bottom: 10px;
  font-size: 14px;
}
  `;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Document Comparison - ${originalFileName} vs ${currentFileName}</title>
  <style>${styles}</style>
</head>
<body>
  <div class="redliner-container">
    <header class="redliner-header">
      <h1>Document Comparison</h1>
      <div class="change-summary">
        <strong>Total Changes Detected: ${totalChanges}</strong>
      </div>
      <div class="file-info">
        <span><strong>Original:</strong> ${originalFileName}</span>
        <span><strong>Current:</strong> ${currentFileName}</span>
      </div>
    </header>

    <div class="comparison-panes">
      <div class="pane pane-original">
        <div class="pane-header">Original</div>
        <div class="pane-content">
          ${leftContent}
        </div>
      </div>
      <div class="pane-divider"></div>
      <div class="pane pane-current">
        <div class="pane-header">Current</div>
        <div class="pane-content">
          ${rightContent}
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

describe('Generate HTML Output for Test Documents', () => {
  it('should generate comparison HTML for contract documents', async () => {
    // Parse both documents
    const buffer1 = await readFile('test-documents/contract_v1.docx');
    const buffer2 = await readFile('test-documents/contract_v2.docx');

    const result1 = await parseOffice(buffer1);
    const result2 = await parseOffice(buffer2);

    const ast1 = normalizeToAST(result1);
    const ast2 = normalizeToAST(result2);

    // Generate diff
    const diffEngine = new DiffEngine();
    const diff = diffEngine.diffDocuments(ast1, ast2);

    // Render blocks
    const leftBlocks: string[] = [];
    const rightBlocks: string[] = [];

    diff.blockDiffs.forEach((blockDiff) => {
      const [leftHtml, rightHtml] = renderBlockDiff(blockDiff);
      leftBlocks.push(leftHtml);
      rightBlocks.push(rightHtml);
    });

    // Generate HTML
    const html = generateHtml(
      leftBlocks.join('\n'),
      rightBlocks.join('\n'),
      'contract_v1.docx',
      'contract_v2.docx',
      diff.totalChanges
    );

    // Write to file
    const outputPath = path.resolve('test-documents', 'comparison-output.html');
    await writeFile(outputPath, html, 'utf-8');

    console.log('\n✅ HTML comparison generated successfully!');
    console.log(`📄 Output file: ${outputPath}`);
    console.log(`🌐 Open in browser: file:///${outputPath.replace(/\\/g, '/')}`);
    console.log(`\n💡 Or run: start ${outputPath}`);

    expect(html).toContain('Document Comparison');
    expect(html).toContain('contract_v1.docx');
    expect(html).toContain('contract_v2.docx');
    expect(diff.totalChanges).toBeGreaterThan(0);
  });
});
