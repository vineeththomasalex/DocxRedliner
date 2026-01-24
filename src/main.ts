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
import { DocxExporter } from './ui/docx-export';
import type { DocumentAST } from './types/ast.types';
import type { DocumentDiff } from './types/diff.types';

class DocRedlinerApp {
  private fileUpload: FileUploadHandler;
  private parser: DocxParser;
  private diffEngine: DiffEngine;
  private renderer: DiffRenderer | null = null;
  private scrollSync: ScrollSynchronizer | null = null;
  private navigator: ChangeNavigator | null = null;
  private exporter: HtmlExporter;
  private docxExporter: DocxExporter;
  private originalFileName: string = '';
  private currentFileName: string = '';

  // Store data for DOCX export
  private currentDiff: DocumentDiff | null = null;
  // @ts-ignore - Stored for future use
  private originalAST: DocumentAST | null = null;
  // @ts-ignore - Stored for future use
  private currentAST: DocumentAST | null = null;

  // Track current view mode
  private currentViewMode: 'side-by-side' | 'redlined' = 'side-by-side';

  constructor() {
    this.fileUpload = new FileUploadHandler();
    this.parser = new DocxParser();
    this.diffEngine = new DiffEngine();
    this.exporter = new HtmlExporter();
    this.docxExporter = new DocxExporter();

    this.fileUpload.onFilesReady((original, current) => {
      this.originalFileName = original.name;
      this.currentFileName = current.name;
      this.compareDocuments(original, current);
    });

    this.setupExportButton();
    this.setupDocxExportButton();
    this.setupViewToggle();
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

      // Store for export
      this.currentDiff = diff;
      this.originalAST = originalAST;
      this.currentAST = currentAST;

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

    // Render based on current view mode
    if (this.currentViewMode === 'redlined') {
      this.renderer.renderRedlined(diff);
    } else {
      this.renderer.render(diff);
    }

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

  private setupDocxExportButton() {
    const exportButton = document.getElementById('export-docx');
    if (exportButton) {
      exportButton.addEventListener('click', () => this.exportDocx());
    }
  }

  private async exportDocx() {
    try {
      if (!this.currentDiff) {
        alert('Please compare documents first before exporting.');
        return;
      }

      await this.docxExporter.export(
        this.currentDiff,
        this.originalFileName,
        this.currentFileName
      );
    } catch (error) {
      console.error('DOCX export failed:', error);
      alert('Failed to export DOCX. Please try again.');
    }
  }

  private setupViewToggle() {
    const toggle = document.getElementById('redline-toggle') as HTMLInputElement;
    if (toggle) {
      toggle.addEventListener('change', () => this.switchViewMode(toggle.checked));
    }
  }

  private switchViewMode(useRedlined: boolean) {
    this.currentViewMode = useRedlined ? 'redlined' : 'side-by-side';

    // Re-render with current diff
    if (this.currentDiff && this.renderer) {
      if (useRedlined) {
        this.showRedlinedView();
        this.renderer.renderRedlined(this.currentDiff);
      } else {
        this.showSideBySideView();
        this.renderer.render(this.currentDiff);
      }

      // Update navigator with new change elements
      const changeElements = this.renderer.getChangeElements();
      if (this.navigator) {
        this.navigator.updateChangeElements(changeElements);
      }
    }
  }

  private showSideBySideView() {
    const originalPane = document.getElementById('pane-original-content');
    const currentPane = document.getElementById('pane-current-content');
    const redlinedPane = document.getElementById('pane-redlined-content');
    const divider = document.querySelector('.pane-divider') as HTMLElement;

    if (originalPane?.parentElement) {
      originalPane.parentElement.style.display = 'flex';
    }
    if (currentPane?.parentElement) {
      currentPane.parentElement.style.display = 'flex';
    }
    if (divider) {
      divider.style.display = 'block';
    }
    if (redlinedPane?.parentElement) {
      redlinedPane.parentElement.style.display = 'none';
    }
  }

  private showRedlinedView() {
    const originalPane = document.getElementById('pane-original-content');
    const currentPane = document.getElementById('pane-current-content');
    const redlinedPane = document.getElementById('pane-redlined-content');
    const divider = document.querySelector('.pane-divider') as HTMLElement;

    if (originalPane?.parentElement) {
      originalPane.parentElement.style.display = 'none';
    }
    if (currentPane?.parentElement) {
      currentPane.parentElement.style.display = 'none';
    }
    if (divider) {
      divider.style.display = 'none';
    }
    if (redlinedPane?.parentElement) {
      redlinedPane.parentElement.style.display = 'flex';
    }
  }
}

// Initialize the application
new DocRedlinerApp();
