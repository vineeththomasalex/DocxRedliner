// Change Navigator - Navigate between changes with Previous/Next buttons

export class ChangeNavigator {
  private changeElements: HTMLElement[];
  private currentIndex: number = -1;
  private prevButton: HTMLButtonElement;
  private nextButton: HTMLButtonElement;
  private counterElement: HTMLElement;

  constructor(
    changeElements: HTMLElement[],
    prevButtonId: string,
    nextButtonId: string,
    counterElementId: string
  ) {
    this.changeElements = changeElements;

    const prev = document.getElementById(prevButtonId) as HTMLButtonElement;
    const next = document.getElementById(nextButtonId) as HTMLButtonElement;
    const counter = document.getElementById(counterElementId);

    if (!prev || !next || !counter) {
      throw new Error('Navigation elements not found');
    }

    this.prevButton = prev;
    this.nextButton = next;
    this.counterElement = counter;

    this.setupListeners();
    this.updateUI();
  }

  private setupListeners() {
    this.prevButton.addEventListener('click', () => this.goToPrevious());
    this.nextButton.addEventListener('click', () => this.goToNext());

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'n' && !this.isInputFocused()) {
        e.preventDefault();
        this.goToNext();
      } else if (e.key === 'p' && !this.isInputFocused()) {
        e.preventDefault();
        this.goToPrevious();
      }
    });
  }

  private isInputFocused(): boolean {
    const active = document.activeElement;
    return active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
  }

  goToNext() {
    if (this.currentIndex < this.changeElements.length - 1) {
      this.navigateToIndex(this.currentIndex + 1);
    } else if (this.changeElements.length > 0) {
      // Loop to first change
      this.navigateToIndex(0);
    }
  }

  goToPrevious() {
    if (this.currentIndex > 0) {
      this.navigateToIndex(this.currentIndex - 1);
    } else if (this.changeElements.length > 0) {
      // Loop to last change
      this.navigateToIndex(this.changeElements.length - 1);
    }
  }

  private navigateToIndex(index: number) {
    // Remove highlight from previous
    if (this.currentIndex >= 0 && this.currentIndex < this.changeElements.length) {
      this.changeElements[this.currentIndex].classList.remove('change-highlight');
    }

    // Add highlight to new
    this.currentIndex = index;
    const element = this.changeElements[this.currentIndex];
    element.classList.add('change-highlight');

    // Scroll into view
    element.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });

    this.updateUI();
  }

  private updateUI() {
    const total = this.changeElements.length;

    if (total === 0) {
      this.counterElement.textContent = 'No changes';
      this.prevButton.disabled = true;
      this.nextButton.disabled = true;
    } else {
      const current = this.currentIndex + 1;
      this.counterElement.textContent = `${current} of ${total} changes`;
      this.prevButton.disabled = false;
      this.nextButton.disabled = false;
    }
  }

  reset() {
    // Remove all highlights
    this.changeElements.forEach(el => el.classList.remove('change-highlight'));
    this.currentIndex = -1;
    this.updateUI();
  }

  updateChangeElements(elements: HTMLElement[]) {
    this.changeElements = elements;
    this.reset();

    if (elements.length > 0) {
      // Automatically go to first change
      this.navigateToIndex(0);
    } else {
      this.updateUI();
    }
  }
}
