// File upload handling with drag-and-drop support

export class FileUploadHandler {
  private originalFile: File | null = null;
  private currentFile: File | null = null;
  private onFileChangeCallback: ((hasOriginal: boolean, hasCurrent: boolean) => void) | null = null;

  constructor() {
    this.initializeUploadHandlers();
  }

  private initializeUploadHandlers() {
    const originalInput = document.getElementById('original-upload') as HTMLInputElement;
    const currentInput = document.getElementById('current-upload') as HTMLInputElement;
    const originalLabel = originalInput.parentElement?.querySelector('.upload-label');
    const currentLabel = currentInput.parentElement?.querySelector('.upload-label');

    // File input change handlers
    originalInput.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        this.handleOriginalFile(file);
      }
    });

    currentInput.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        this.handleCurrentFile(file);
      }
    });

    // Drag and drop for original
    if (originalLabel) {
      this.setupDragAndDrop(originalLabel, (file) => this.handleOriginalFile(file));
    }

    // Drag and drop for current
    if (currentLabel) {
      this.setupDragAndDrop(currentLabel, (file) => this.handleCurrentFile(file));
    }
  }

  private setupDragAndDrop(label: Element, onDrop: (file: File) => void) {
    label.addEventListener('dragover', (e) => {
      e.preventDefault();
      label.classList.add('drag-over');
    });

    label.addEventListener('dragleave', () => {
      label.classList.remove('drag-over');
    });

    label.addEventListener('drop', (e) => {
      e.preventDefault();
      label.classList.remove('drag-over');

      const file = (e as DragEvent).dataTransfer?.files[0];
      if (file && file.name.endsWith('.docx')) {
        onDrop(file);
      } else {
        alert('Please drop a .docx file');
      }
    });
  }

  private handleOriginalFile(file: File) {
    this.originalFile = file;
    this.updateFileDisplay('original', file.name);
    this.notifyFileChange();
  }

  private handleCurrentFile(file: File) {
    this.currentFile = file;
    this.updateFileDisplay('current', file.name);
    this.notifyFileChange();
  }

  private updateFileDisplay(type: 'original' | 'current', fileName: string) {
    const nameElement = document.getElementById(`${type}-name`);
    const label = document.getElementById(`${type}-upload`)?.parentElement?.querySelector('.upload-label');

    if (nameElement) {
      nameElement.textContent = fileName;
    }

    if (label) {
      label.classList.add('has-file');
    }
  }

  private notifyFileChange() {
    if (this.onFileChangeCallback) {
      this.onFileChangeCallback(!!this.originalFile, !!this.currentFile);
    }
  }

  /**
   * Register callback for when file selection changes
   */
  public onFileChange(callback: (hasOriginal: boolean, hasCurrent: boolean) => void) {
    this.onFileChangeCallback = callback;
  }

  /**
   * Check if both files are ready for comparison
   */
  public areBothFilesReady(): boolean {
    return !!this.originalFile && !!this.currentFile;
  }

  /**
   * Get the selected files for comparison
   */
  public getFiles(): { original: File; current: File } | null {
    if (!this.originalFile || !this.currentFile) {
      return null;
    }
    return {
      original: this.originalFile,
      current: this.currentFile
    };
  }

  /**
   * @deprecated Use onFileChange() and getFiles() instead
   */
  public onFilesReady(_callback: (original: File, current: File) => void) {
    // Keep for backward compatibility but don't auto-trigger
    console.warn('onFilesReady is deprecated. Use onFileChange() and getFiles() instead.');
  }

  public reset() {
    this.originalFile = null;
    this.currentFile = null;

    const originalInput = document.getElementById('original-upload') as HTMLInputElement;
    const currentInput = document.getElementById('current-upload') as HTMLInputElement;

    if (originalInput) originalInput.value = '';
    if (currentInput) currentInput.value = '';

    ['original', 'current'].forEach(type => {
      const nameElement = document.getElementById(`${type}-name`);
      const label = document.getElementById(`${type}-upload`)?.parentElement?.querySelector('.upload-label');

      if (nameElement) nameElement.textContent = '';
      if (label) label.classList.remove('has-file');
    });

    this.notifyFileChange();
  }
}
