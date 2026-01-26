/**
 * Test setup file for job-applicator.
 *
 * This file is loaded before all tests to set up global mocks and prevent
 * accidental expensive operations during testing.
 */

import { vi } from "vitest"

// Mock child_process.spawn to prevent any accidental CLI calls
// Used for Claude CLI in form-filling (not for job extraction which uses Gemini API)
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
