// Test setup - Global mocks and environment configuration

import { vi } from 'vitest';

// Mock window.officeParser for browser-dependent code
Object.defineProperty(globalThis, 'officeParser', {
  value: {
    parseOffice: vi.fn()
  },
  writable: true
});

// Mock URL.createObjectURL and URL.revokeObjectURL for export tests
if (typeof URL.createObjectURL === 'undefined') {
  URL.createObjectURL = vi.fn(() => 'blob:mock-url');
}

if (typeof URL.revokeObjectURL === 'undefined') {
  URL.revokeObjectURL = vi.fn();
}

// Mock scrollIntoView for navigation tests
Element.prototype.scrollIntoView = vi.fn();

// Reset mocks between tests
beforeEach(() => {
  vi.clearAllMocks();
});
