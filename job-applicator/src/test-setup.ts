/**
 * Test setup file for job-applicator.
 *
 * This file is loaded before all tests to set up global mocks and prevent
 * accidental expensive AI CLI calls during testing.
 */

import { vi } from "vitest"

// Mock child_process.spawn to prevent any accidental AI CLI calls
// The AI CLI tools (claude, gemini) are invoked via spawn in main.ts
vi.mock("child_process", () => ({
  spawn: vi.fn(() => {
    throw new Error(
      "child_process.spawn is mocked in tests to prevent AI CLI calls. " +
        "If you need to test CLI functionality, create explicit mocks for the specific test."
    )
  }),
}))

// Mock Electron modules that aren't available in Node test environment
vi.mock("electron", () => ({
  app: {
    whenReady: vi.fn(() => Promise.resolve()),
    on: vi.fn(),
    quit: vi.fn(),
    commandLine: {
      appendSwitch: vi.fn(),
    },
  },
  BrowserWindow: vi.fn(),
  BrowserView: vi.fn(),
  ipcMain: {
    handle: vi.fn(),
  },
  contextBridge: {
    exposeInMainWorld: vi.fn(),
  },
  ipcRenderer: {
    invoke: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
  },
}))

// Mock playwright-core to prevent actual browser automation
vi.mock("playwright-core", () => ({
  chromium: {
    connectOverCDP: vi.fn(() => Promise.reject(new Error("Playwright is mocked in tests"))),
  },
}))
