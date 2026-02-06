// Unit tests for ChangeNavigator - DOM-based tests

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChangeNavigator } from '../../src/renderer/change-navigator';

describe('ChangeNavigator', () => {
  let prevButton: HTMLButtonElement;
  let nextButton: HTMLButtonElement;
  let counter: HTMLElement;
  let changeElements: HTMLElement[];

  beforeEach(() => {
    // Set up DOM
    document.body.innerHTML = `
      <button id="btn-prev">Previous</button>
      <button id="btn-next">Next</button>
      <span id="change-counter">0 of 0</span>
      <div id="changes">
        <div class="change" data-change-id="change-0">Change 1</div>
        <div class="change" data-change-id="change-1">Change 2</div>
        <div class="change" data-change-id="change-2">Change 3</div>
      </div>
    `;

    prevButton = document.getElementById('btn-prev') as HTMLButtonElement;
    nextButton = document.getElementById('btn-next') as HTMLButtonElement;
    counter = document.getElementById('change-counter') as HTMLElement;
    changeElements = Array.from(document.querySelectorAll('.change')) as HTMLElement[];
  });

  describe('Constructor', () => {
    it('should throw error when navigation elements not found', () => {
      expect(() => new ChangeNavigator([], 'nonexistent', 'also-nonexistent', 'missing'))
        .toThrow('Navigation elements not found');
    });

    it('should initialize with valid element IDs', () => {
      expect(() => new ChangeNavigator(changeElements, 'btn-prev', 'btn-next', 'change-counter'))
        .not.toThrow();
    });

    it('should display counter with total count on init', () => {
      new ChangeNavigator(changeElements, 'btn-prev', 'btn-next', 'change-counter');
      // After initialization, currentIndex is -1, so it shows "0 of 3 changes"
      expect(counter.textContent).toBe('0 of 3 changes');
    });

    it('should NOT auto-navigate on constructor (currentIndex stays at -1)', () => {
      new ChangeNavigator(changeElements, 'btn-prev', 'btn-next', 'change-counter');
      // No element should be highlighted after just construction
      expect(changeElements[0].classList.contains('change-highlight')).toBe(false);
    });
  });

  describe('goToNext()', () => {
    it('should navigate to first change when currentIndex is -1', () => {
      const navigator = new ChangeNavigator(changeElements, 'btn-prev', 'btn-next', 'change-counter');

      navigator.goToNext();

      expect(changeElements[0].classList.contains('change-highlight')).toBe(true);
      expect(counter.textContent).toBe('1 of 3 changes');
    });

    it('should navigate to next change', () => {
      const navigator = new ChangeNavigator(changeElements, 'btn-prev', 'btn-next', 'change-counter');

      navigator.goToNext(); // Go to first (index 0)
      navigator.goToNext(); // Go to second (index 1)

      expect(changeElements[0].classList.contains('change-highlight')).toBe(false);
      expect(changeElements[1].classList.contains('change-highlight')).toBe(true);
      expect(counter.textContent).toBe('2 of 3 changes');
    });

    it('should loop to first change at end', () => {
      const navigator = new ChangeNavigator(changeElements, 'btn-prev', 'btn-next', 'change-counter');

      navigator.goToNext(); // 1
      navigator.goToNext(); // 2
      navigator.goToNext(); // 3
      navigator.goToNext(); // should loop to 1

      expect(changeElements[0].classList.contains('change-highlight')).toBe(true);
      expect(counter.textContent).toBe('1 of 3 changes');
    });

    it('should call scrollIntoView', () => {
      const navigator = new ChangeNavigator(changeElements, 'btn-prev', 'btn-next', 'change-counter');

      vi.clearAllMocks();
      navigator.goToNext();

      expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    });
  });

  describe('goToPrevious()', () => {
    it('should loop to last change when at beginning', () => {
      const navigator = new ChangeNavigator(changeElements, 'btn-prev', 'btn-next', 'change-counter');

      navigator.goToPrevious(); // Should loop to last

      expect(changeElements[2].classList.contains('change-highlight')).toBe(true);
      expect(counter.textContent).toBe('3 of 3 changes');
    });

    it('should navigate to previous change', () => {
      const navigator = new ChangeNavigator(changeElements, 'btn-prev', 'btn-next', 'change-counter');

      navigator.goToNext(); // Go to 1
      navigator.goToNext(); // Go to 2
      navigator.goToPrevious(); // Back to 1

      expect(changeElements[0].classList.contains('change-highlight')).toBe(true);
      expect(counter.textContent).toBe('1 of 3 changes');
    });
  });

  describe('Button clicks', () => {
    it('should navigate on next button click', () => {
      new ChangeNavigator(changeElements, 'btn-prev', 'btn-next', 'change-counter');

      nextButton.click();

      expect(changeElements[0].classList.contains('change-highlight')).toBe(true);
    });

    it('should navigate on previous button click', () => {
      const navigator = new ChangeNavigator(changeElements, 'btn-prev', 'btn-next', 'change-counter');

      navigator.goToNext(); // Go to 1
      navigator.goToNext(); // Go to 2
      prevButton.click(); // Back to 1

      expect(changeElements[0].classList.contains('change-highlight')).toBe(true);
    });
  });

  describe('Keyboard shortcuts', () => {
    it('should navigate on "n" key press', () => {
      new ChangeNavigator(changeElements, 'btn-prev', 'btn-next', 'change-counter');

      const event = new KeyboardEvent('keydown', { key: 'n' });
      document.dispatchEvent(event);

      expect(changeElements[0].classList.contains('change-highlight')).toBe(true);
    });

    it('should navigate on "p" key press', () => {
      const navigator = new ChangeNavigator(changeElements, 'btn-prev', 'btn-next', 'change-counter');

      navigator.goToNext(); // Go to 1
      navigator.goToNext(); // Go to 2

      const event = new KeyboardEvent('keydown', { key: 'p' });
      document.dispatchEvent(event);

      expect(changeElements[0].classList.contains('change-highlight')).toBe(true);
    });

    it('should not navigate when input is focused', () => {
      const navigator = new ChangeNavigator(changeElements, 'btn-prev', 'btn-next', 'change-counter');

      navigator.goToNext(); // Go to first

      // Add and focus an input
      const input = document.createElement('input');
      document.body.appendChild(input);
      input.focus();

      const event = new KeyboardEvent('keydown', { key: 'n' });
      document.dispatchEvent(event);

      // Should still be on first change (not moved to second)
      expect(changeElements[0].classList.contains('change-highlight')).toBe(true);
      expect(changeElements[1].classList.contains('change-highlight')).toBe(false);
    });

    it('should not navigate when textarea is focused', () => {
      const navigator = new ChangeNavigator(changeElements, 'btn-prev', 'btn-next', 'change-counter');

      navigator.goToNext(); // Go to first

      // Add and focus a textarea
      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);
      textarea.focus();

      const event = new KeyboardEvent('keydown', { key: 'n' });
      document.dispatchEvent(event);

      // Should still be on first change
      expect(changeElements[0].classList.contains('change-highlight')).toBe(true);
      expect(changeElements[1].classList.contains('change-highlight')).toBe(false);
    });
  });

  describe('Empty changes', () => {
    it('should disable buttons when no changes', () => {
      new ChangeNavigator([], 'btn-prev', 'btn-next', 'change-counter');

      expect(prevButton.disabled).toBe(true);
      expect(nextButton.disabled).toBe(true);
      expect(counter.textContent).toBe('No changes');
    });

    it('should not throw on navigation with no changes', () => {
      const navigator = new ChangeNavigator([], 'btn-prev', 'btn-next', 'change-counter');

      expect(() => navigator.goToNext()).not.toThrow();
      expect(() => navigator.goToPrevious()).not.toThrow();
    });
  });

  describe('reset()', () => {
    it('should remove all highlights', () => {
      const navigator = new ChangeNavigator(changeElements, 'btn-prev', 'btn-next', 'change-counter');

      navigator.goToNext();
      navigator.reset();

      changeElements.forEach(el => {
        expect(el.classList.contains('change-highlight')).toBe(false);
      });
    });

    it('should reset currentIndex to -1', () => {
      const navigator = new ChangeNavigator(changeElements, 'btn-prev', 'btn-next', 'change-counter');

      navigator.goToNext();
      navigator.reset();

      // After reset, counter shows "0 of 3"
      expect(counter.textContent).toBe('0 of 3 changes');
    });
  });

  describe('updateChangeElements()', () => {
    it('should update to new elements and auto-navigate to first', () => {
      const navigator = new ChangeNavigator(changeElements, 'btn-prev', 'btn-next', 'change-counter');

      // Create new elements
      const newChanges = document.createElement('div');
      newChanges.innerHTML = `
        <div class="new-change" data-change-id="new-0">New 1</div>
        <div class="new-change" data-change-id="new-1">New 2</div>
      `;
      const newElements = Array.from(newChanges.querySelectorAll('.new-change')) as HTMLElement[];

      navigator.updateChangeElements(newElements);

      expect(counter.textContent).toBe('1 of 2 changes');
      expect(newElements[0].classList.contains('change-highlight')).toBe(true);
    });

    it('should reset when updating with empty array', () => {
      const navigator = new ChangeNavigator(changeElements, 'btn-prev', 'btn-next', 'change-counter');

      navigator.updateChangeElements([]);

      expect(counter.textContent).toBe('No changes');
      expect(prevButton.disabled).toBe(true);
      expect(nextButton.disabled).toBe(true);
    });

    it('should auto-navigate to first change when updating with new elements', () => {
      const navigator = new ChangeNavigator(changeElements, 'btn-prev', 'btn-next', 'change-counter');

      const newChanges = document.createElement('div');
      newChanges.innerHTML = `
        <div class="new-change" data-change-id="new-0">New 1</div>
      `;
      const newElements = Array.from(newChanges.querySelectorAll('.new-change')) as HTMLElement[];

      navigator.updateChangeElements(newElements);

      expect(newElements[0].classList.contains('change-highlight')).toBe(true);
    });
  });

  describe('Counter display', () => {
    it('should show "0 of Y changes" format initially', () => {
      new ChangeNavigator(changeElements, 'btn-prev', 'btn-next', 'change-counter');

      expect(counter.textContent).toBe('0 of 3 changes');
    });

    it('should update counter on navigation', () => {
      const navigator = new ChangeNavigator(changeElements, 'btn-prev', 'btn-next', 'change-counter');

      navigator.goToNext();
      expect(counter.textContent).toBe('1 of 3 changes');

      navigator.goToNext();
      expect(counter.textContent).toBe('2 of 3 changes');

      navigator.goToNext();
      expect(counter.textContent).toBe('3 of 3 changes');
    });
  });

  describe('Highlight management', () => {
    it('should only highlight current change', () => {
      const navigator = new ChangeNavigator(changeElements, 'btn-prev', 'btn-next', 'change-counter');

      navigator.goToNext(); // Go to first
      navigator.goToNext(); // Go to second

      const highlighted = changeElements.filter(el => el.classList.contains('change-highlight'));
      expect(highlighted.length).toBe(1);
      expect(highlighted[0]).toBe(changeElements[1]);
    });

    it('should remove previous highlight on navigation', () => {
      const navigator = new ChangeNavigator(changeElements, 'btn-prev', 'btn-next', 'change-counter');

      navigator.goToNext(); // Go to first
      expect(changeElements[0].classList.contains('change-highlight')).toBe(true);

      navigator.goToNext(); // Go to second

      expect(changeElements[0].classList.contains('change-highlight')).toBe(false);
      expect(changeElements[1].classList.contains('change-highlight')).toBe(true);
    });
  });
});
