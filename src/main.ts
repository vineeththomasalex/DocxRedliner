// Main application entry point

import './styles/main.css';
import './styles/diff-highlights.css';

import { FileUploadHandler } from './ui/file-upload';
import { DocxParser } from './parsers/docx-parser';
import { DiffEngine, type DiffResult } from './diff/diff-engine';
import { DiffRenderer } from './renderer/diff-renderer';
import { ChangeNavigator } from './renderer/change-navigator';
import { DocxInPlaceExporter } from './ui/docx-export-inplace';
import { DebugExporter } from './ui/debug-export';
import type { DocumentAST } from './types/ast.types';
import type { DocumentDiff } from './types/diff.types';
import type { AlignmentDecision } from './types/debug.types';

class DocRedlinerApp {
  private fileUpload: FileUploadHandler;
  private parser: DocxParser;
  private diffEngine: DiffEngine;
  private renderer: DiffRenderer | null = null;
  private navigator: ChangeNavigator | null = null;
  private docxInPlaceExporter: DocxInPlaceExporter;
  private debugExporter: DebugExporter;
  private originalFileName: string = '';
  private currentFileName: string = '';

  // Debug mode flag
  private debugMode: boolean = false;

  // Store data for DOCX export
  private currentDiff: DocumentDiff | null = null;
  private originalAST: DocumentAST | null = null;
  private currentAST: DocumentAST | null = null;

  // Store alignment decisions for debug export
  private alignmentDecisions: AlignmentDecision[] = [];

  // Store raw file buffer for in-place DOCX export
  private currentFileBuffer: ArrayBuffer | null = null;

  constructor() {
    this.fileUpload = new FileUploadHandler();
    this.parser = new DocxParser();
    this.diffEngine = new DiffEngine();
    this.docxInPlaceExporter = new DocxInPlaceExporter();
    this.debugExporter = new DebugExporter();

    // Check for debug mode from URL param
    this.debugMode = this.checkDebugMode();
    this.diffEngine.setDebugMode(this.debugMode);

    // Show/hide debug button based on mode
    this.updateDebugButtonVisibility();

    this.fileUpload.onFilesReady((original, current) => {
      this.originalFileName = original.name;
      this.currentFileName = current.name;
      this.compareDocuments(original, current);
    });

    this.setupDocxExportButton();
    this.setupDebugExportButton();
  }

  /**
   * Check if debug mode is enabled via URL param
   */
  private checkDebugMode(): boolean {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('debug') === 'true';
  }

  /**
   * Show or hide the debug export button based on debug mode
   */
  private updateDebugButtonVisibility(): void {
    const debugButton = document.getElementById('export-debug');
    if (debugButton) {
      debugButton.style.display = this.debugMode ? 'inline-block' : 'none';
    }
  }

  private async compareDocuments(originalFile: File, currentFile: File) {
    try {
      // Show progress
      this.showProgress('Parsing documents...');

      // Store the current file buffer for in-place DOCX export
      this.currentFileBuffer = await currentFile.arrayBuffer();

      // Parse both documents
      const [originalAST, currentAST] = await Promise.all([
        this.parser.parseFile(originalFile),
        this.parser.parseFile(currentFile)
      ]);

      this.updateProgress(50, 'Comparing documents...');

      // Diff the documents (with debug info if debug mode is enabled)
      const result: DiffResult = this.diffEngine.diffDocumentsWithDebug(originalAST, currentAST);

      // Store for export
      this.currentDiff = result.diff;
      this.originalAST = originalAST;
      this.currentAST = currentAST;
      this.alignmentDecisions = result.alignmentDecisions || [];

      this.updateProgress(75, 'Rendering comparison...');

      // Render the diff
      this.renderComparison(result.diff);

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

  private renderComparison(diff: DocumentDiff) {
    // Initialize renderer if not already
    if (!this.renderer) {
      this.renderer = new DiffRenderer('pane-redlined-content');
    }

    // Render redlined view
    this.renderer.renderRedlined(diff);

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

  private setupDocxExportButton() {
    const exportButton = document.getElementById('export-docx');
    if (exportButton) {
      exportButton.addEventListener('click', () => this.exportDocx());
    }
  }

  private setupDebugExportButton() {
    const debugButton = document.getElementById('export-debug');
    if (debugButton) {
      debugButton.addEventListener('click', () => this.exportDebugReport());
    }
  }

  private async exportDocx() {
    const exportButton = document.getElementById('export-docx');

    if (!this.currentDiff) {
      alert('Please compare documents first before exporting.');
      return;
    }

    if (!this.currentFileBuffer) {
      alert('Current file buffer not available. Please try comparing documents again.');
      return;
    }

    // Show loading state
    this.setButtonLoading(exportButton, true, 'Exporting...');

    try {
      // Small delay to allow UI to update
      await new Promise(resolve => setTimeout(resolve, 10));

      // Use in-place exporter to preserve original formatting
      await this.docxInPlaceExporter.export(
        this.currentDiff,
        this.currentFileBuffer,
        this.originalFileName
      );
    } catch (error) {
      console.error('DOCX export failed:', error);
      alert('Failed to export DOCX. Please try again.');
    } finally {
      this.setButtonLoading(exportButton, false, 'Export DOCX');
    }
  }

  private exportDebugReport() {
    if (!this.currentDiff || !this.originalAST || !this.currentAST) {
      alert('Please compare documents first before exporting debug report.');
      return;
    }

    const report = this.debugExporter.generateReport(
      this.originalAST,
      this.currentAST,
      this.currentDiff,
      this.alignmentDecisions,
      this.originalFileName,
      this.currentFileName
    );

    this.debugExporter.exportToFile(report);
  }

  private setButtonLoading(button: HTMLElement | null, loading: boolean, text: string) {
    if (!button) return;

    if (loading) {
      button.classList.add('exporting');
      button.innerHTML = `<span class="spinner"></span>${text}`;
    } else {
      button.classList.remove('exporting');
      button.textContent = text;
    }
  }
}

// Initialize the application
new DocRedlinerApp();
