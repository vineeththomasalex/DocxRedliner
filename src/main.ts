// Main application entry point

import './styles/main.css';
import './styles/diff-highlights.css';

import { FileUploadHandler } from './ui/file-upload';
import { DocxParser } from './parsers/docx-parser';
import { DiffEngine } from './diff/diff-engine';
import { DiffRenderer } from './renderer/diff-renderer';
import { ScrollSynchronizer } from './renderer/scroll-sync';
import { ChangeNavigator } from './renderer/change-navigator';
import { HtmlExporter } from './ui/html-export';

class DocRedlinerApp {
  private fileUpload: FileUploadHandler;
  private parser: DocxParser;
  private diffEngine: DiffEngine;
  private renderer: DiffRenderer | null = null;
  private scrollSync: ScrollSynchronizer | null = null;
  private navigator: ChangeNavigator | null = null;
  private exporter: HtmlExporter;
  private originalFileName: string = '';
  private currentFileName: string = '';

  constructor() {
    this.fileUpload = new FileUploadHandler();
    this.parser = new DocxParser();
    this.diffEngine = new DiffEngine();
    this.exporter = new HtmlExporter();

    this.fileUpload.onFilesReady((original, current) => {
      this.originalFileName = original.name;
      this.currentFileName = current.name;
      this.compareDocuments(original, current);
    });

    this.setupExportButton();
  }

  private async compareDocuments(originalFile: File, currentFile: File) {
    try {
      // Show progress
      this.showProgress('Parsing documents...');

      // Parse both documents
      const [originalAST, currentAST] = await Promise.all([
        this.parser.parseFile(originalFile),
        this.parser.parseFile(currentFile)
      ]);

      this.updateProgress(50, 'Comparing documents...');

      // Diff the documents
      const diff = this.diffEngine.diffDocuments(originalAST, currentAST);

      this.updateProgress(75, 'Rendering comparison...');

      // Render the diff
      this.renderComparison(diff);

      this.updateProgress(100, 'Complete!');

      // Hide progress and show comparison
      setTimeout(() => {
        this.hideProgress();
        this.showComparison();
      }, 500);

    } catch (error) {
      console.error('Error comparing documents:', error);
      alert('Error comparing documents: ' + (error instanceof Error ? error.message : 'Unknown error'));
      this.hideProgress();
    }
  }

  private renderComparison(diff: any) {
    // Initialize renderer if not already
    if (!this.renderer) {
      this.renderer = new DiffRenderer('pane-original-content', 'pane-current-content');
    }

    // Render the diff
    this.renderer.render(diff);

    // Setup synchronized scrolling
    if (!this.scrollSync) {
      this.scrollSync = new ScrollSynchronizer('pane-original-content', 'pane-current-content');
    }

    // Setup change navigation
    const changeElements = this.renderer.getChangeElements();
    if (this.navigator) {
      this.navigator.updateChangeElements(changeElements);
    } else {
      this.navigator = new ChangeNavigator(
        changeElements,
        'prev-change',
        'next-change',
        'change-counter'
      );
    }
  }

  private showProgress(text: string) {
    const progress = document.getElementById('progress');
    if (progress) {
      progress.style.display = 'block';
    }
    this.updateProgress(0, text);
  }

  private updateProgress(percent: number, text: string) {
    const fill = document.getElementById('progress-fill');
    const textEl = document.getElementById('progress-text');

    if (fill) {
      fill.style.width = percent + '%';
    }
    if (textEl) {
      textEl.textContent = text;
    }
  }

  private hideProgress() {
    const progress = document.getElementById('progress');
    if (progress) {
      progress.style.display = 'none';
    }
  }

  private showComparison() {
    const comparison = document.getElementById('comparison');
    const controls = document.getElementById('controls');

    if (comparison) {
      comparison.style.display = 'flex';
    }
    if (controls) {
      controls.style.display = 'flex';
    }
  }

  private setupExportButton() {
    const exportButton = document.getElementById('export-html');
    if (exportButton) {
      exportButton.addEventListener('click', () => this.exportHtml());
    }
  }

  private exportHtml() {
    const leftPane = document.getElementById('pane-original-content');
    const rightPane = document.getElementById('pane-current-content');

    if (leftPane && rightPane) {
      this.exporter.export(
        leftPane.innerHTML,
        rightPane.innerHTML,
        this.originalFileName,
        this.currentFileName
      );
    }
  }
}

// Initialize the application
new DocRedlinerApp();
