// Synchronized scrolling between two panes

export class ScrollSynchronizer {
  private leftPane: HTMLElement;
  private rightPane: HTMLElement;
  private syncing: boolean = false;

  constructor(leftPaneId: string, rightPaneId: string) {
    const left = document.getElementById(leftPaneId);
    const right = document.getElementById(rightPaneId);

    if (!left || !right) {
      throw new Error('Panes not found');
    }

    this.leftPane = left;
    this.rightPane = right;

    this.setupListeners();
  }

  private setupListeners() {
    this.leftPane.addEventListener('scroll', () => this.syncScroll('left'), { passive: true });
    this.rightPane.addEventListener('scroll', () => this.syncScroll('right'), { passive: true });
  }

  private syncScroll(source: 'left' | 'right') {
    if (this.syncing) return;

    this.syncing = true;

    const sourcePane = source === 'left' ? this.leftPane : this.rightPane;
    const targetPane = source === 'left' ? this.rightPane : this.leftPane;

    // Calculate scroll percentage
    const maxScroll = sourcePane.scrollHeight - sourcePane.clientHeight;
    if (maxScroll <= 0) {
      this.syncing = false;
      return;
    }

    const scrollPercent = sourcePane.scrollTop / maxScroll;

    // Apply to target
    const targetMaxScroll = targetPane.scrollHeight - targetPane.clientHeight;
    targetPane.scrollTop = scrollPercent * targetMaxScroll;

    // Use setTimeout to allow the scroll event to complete
    setTimeout(() => {
      this.syncing = false;
    }, 0);
  }
}
