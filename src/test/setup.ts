import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach, beforeAll, vi } from "vitest";

// matchMedia mock para theme-provider e tailwind
beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  // IntersectionObserver mock (usado por algumas libs)
  class IO {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
    takeRecords = vi.fn(() => []);
    root = null;
    rootMargin = "";
    thresholds = [];
  }
  Object.defineProperty(window, "IntersectionObserver", { writable: true, value: IO });
});

afterEach(() => {
  cleanup();
});
