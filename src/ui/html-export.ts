// HTML Export - Export comparison as standalone HTML file

export class HtmlExporter {
  export(leftPaneContent: string, rightPaneContent: string, originalFileName: string, currentFileName: string) {
    const html = this.generateStandaloneHtml(leftPaneContent, rightPaneContent, originalFileName, currentFileName);
    this.downloadHtml(html, 'document-comparison.html');
  }

  private generateStandaloneHtml(leftContent: string, rightContent: string, originalFileName: string, currentFileName: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Document Comparison - ${originalFileName} vs ${currentFileName}</title>
  <style>
    ${this.getInlineStyles()}
  </style>
</head>
<body>
  <div class="redliner-container">
    <header class="redliner-header">
      <h1>Document Comparison</h1>
      <div class="file-info">
        <span><strong>Original:</strong> ${this.escapeHtml(originalFileName)}</span>
        <span><strong>Current:</strong> ${this.escapeHtml(currentFileName)}</span>
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

  private getInlineStyles(): string {
    return `
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

.diff-format-change {
  border-left: 3px solid #0969da;
  padding-left: 6px;
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

.para-heading3 {
  font-size: 16px;
  font-weight: 700;
  margin: 14px 0 8px 0;
}

.para-normal,
.para-paragraph {
  font-size: 14px;
  margin: 8px 0;
}
    `;
  }

  private downloadHtml(html: string, filename: string) {
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
