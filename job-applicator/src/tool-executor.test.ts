import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { BrowserView } from "electron"

// Mock logger before importing tool-executor
vi.mock("./logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

// Mock api-client
vi.mock("./api-client.js", () => ({
  startGeneration: vi.fn(),
  executeGenerationStep: vi.fn(),
  fetchGeneratorRequest: vi.fn(),
}))

// Mock utils
vi.mock("./utils.js", () => ({
  resolveDocumentPath: vi.fn((url: string, dir: string) => `${dir}/${url.split("/").pop()}`),
  getConfig: vi.fn(() => ({ ARTIFACTS_DIR: "/data/artifacts" })),
}))

// Mock fs
vi.mock("fs", () => ({
  existsSync: vi.fn(() => true),
}))

import {
  executeTool,
  setBrowserView,
  getBrowserView,
  setCurrentJobMatchId,
  getCurrentJobMatchId,
  clearJobContext,
} from "./tool-executor.js"

// Helper to create mock BrowserView
function createMockBrowserView(overrides: {
  webContents?: Record<string, unknown>
  bounds?: { x: number; y: number; width: number; height: number }
} = {}): BrowserView {
  const mockDebugger = {
    attach: vi.fn(),
    detach: vi.fn(),
    sendCommand: vi.fn().mockResolvedValue({}),
  }

  const defaultWebContents = {
    capturePage: vi.fn().mockResolvedValue({
      getSize: () => ({ width: 1920, height: 1080 }),
      resize: vi.fn().mockReturnValue({
        toJPEG: () => Buffer.from("fake-jpeg-data"),
        getSize: () => ({ width: 1280, height: 720 }),
      }),
      toJPEG: () => Buffer.from("fake-jpeg-data"),
    }),
    executeJavaScript: vi.fn().mockResolvedValue(null),
    getURL: vi.fn().mockReturnValue("https://example.com/job"),
    debugger: mockDebugger,
  }

  return {
    webContents: { ...defaultWebContents, ...overrides.webContents },
    getBounds: vi.fn().mockReturnValue(overrides.bounds || { x: 0, y: 0, width: 1280, height: 800 }),
  } as unknown as BrowserView
}

describe("Tool Executor", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setBrowserView(null)
    clearJobContext()
  })

  afterEach(() => {
    setBrowserView(null)
    clearJobContext()
  })

  // ============================================================================
  // BrowserView Management
  // ============================================================================

  describe("BrowserView management", () => {
    it("should set and get BrowserView reference", () => {
      const mockView = createMockBrowserView()

      expect(getBrowserView()).toBeNull()
      setBrowserView(mockView)
      expect(getBrowserView()).toBe(mockView)
    })

    it("should clear BrowserView reference", () => {
      const mockView = createMockBrowserView()
      setBrowserView(mockView)
      setBrowserView(null)
      expect(getBrowserView()).toBeNull()
    })
  })

  // ============================================================================
  // Job Context Management
  // ============================================================================

  describe("Job context management", () => {
    it("should set and get current job match ID", () => {
      expect(getCurrentJobMatchId()).toBeNull()
      setCurrentJobMatchId("job-123")
      expect(getCurrentJobMatchId()).toBe("job-123")
    })

    it("should clear job context", () => {
      setCurrentJobMatchId("job-123")
      clearJobContext()
      expect(getCurrentJobMatchId()).toBeNull()
    })
  })

  // ============================================================================
  // Unknown Tool
  // ============================================================================

  describe("unknown tool", () => {
    it("should return error for unknown tool", async () => {
      const result = await executeTool("unknown_tool", {})
      expect(result.success).toBe(false)
      expect(result.error).toContain("Unknown tool")
    })
  })

  // ============================================================================
  // Screenshot Tool
  // ============================================================================

  describe("screenshot tool", () => {
    it("should return error when BrowserView not initialized", async () => {
      const result = await executeTool("screenshot", {})
      expect(result.success).toBe(false)
      expect(result.error).toBe("BrowserView not initialized")
    })

    it("should capture and return screenshot", async () => {
      const mockView = createMockBrowserView()
      setBrowserView(mockView)

      const result = await executeTool("screenshot", {})

      expect(result.success).toBe(true)
      expect(result.data).toHaveProperty("image")
      expect(result.data).toHaveProperty("width")
      expect(result.data).toHaveProperty("height")
      expect(result.data).toHaveProperty("hash")
      expect((result.data as { image: string }).image).toContain("data:image/jpeg;base64,")
    })

    it("should resize large screenshots to target width", async () => {
      const mockView = createMockBrowserView()
      setBrowserView(mockView)

      const result = await executeTool("screenshot", {})

      expect(result.success).toBe(true)
      // Width should be constrained to 1280
      expect((result.data as { width: number }).width).toBe(1280)
    })
  })

  // ============================================================================
  // Get Form Fields Tool
  // ============================================================================

  describe("get_form_fields tool", () => {
    it("should return error when BrowserView not initialized", async () => {
      const result = await executeTool("get_form_fields", {})
      expect(result.success).toBe(false)
      expect(result.error).toBe("BrowserView not initialized")
    })

    it("should return form fields from page", async () => {
      const mockFields = [
        { index: 0, type: "text", name: "email", label: "Email", x: 100, y: 200 },
        { index: 1, type: "text", name: "name", label: "Full Name", x: 100, y: 300 },
      ]

      const mockView = createMockBrowserView({
        webContents: {
          executeJavaScript: vi.fn().mockResolvedValue(mockFields),
        },
      })
      setBrowserView(mockView)

      const result = await executeTool("get_form_fields", {})

      expect(result.success).toBe(true)
      expect((result.data as { fields: unknown[] }).fields).toEqual(mockFields)
    })
  })

  // ============================================================================
  // Get Page Info Tool
  // ============================================================================

  describe("get_page_info tool", () => {
    it("should return error when BrowserView not initialized", async () => {
      const result = await executeTool("get_page_info", {})
      expect(result.success).toBe(false)
      expect(result.error).toBe("BrowserView not initialized")
    })

    it("should return page URL and title", async () => {
      const mockView = createMockBrowserView({
        webContents: {
          getURL: vi.fn().mockReturnValue("https://example.com/jobs/123"),
          executeJavaScript: vi.fn().mockResolvedValue("Software Engineer - Example Corp"),
        },
      })
      setBrowserView(mockView)

      const result = await executeTool("get_page_info", {})

      expect(result.success).toBe(true)
      expect((result.data as { url: string }).url).toBe("https://example.com/jobs/123")
      expect((result.data as { title: string }).title).toBe("Software Engineer - Example Corp")
    })
  })

  // ============================================================================
  // Click Tool
  // ============================================================================

  describe("click tool", () => {
    it("should return error when BrowserView not initialized", async () => {
      const result = await executeTool("click", { x: 100, y: 200 })
      expect(result.success).toBe(false)
      expect(result.error).toBe("BrowserView not initialized")
    })

    it("should return error when coordinates missing", async () => {
      const mockView = createMockBrowserView()
      setBrowserView(mockView)

      const result = await executeTool("click", {})
      expect(result.success).toBe(false)
      expect(result.error).toContain("requires x and y coordinates")
    })

    it("should return error when coordinates out of bounds", async () => {
      const mockView = createMockBrowserView({
        bounds: { x: 0, y: 0, width: 1280, height: 800 },
      })
      setBrowserView(mockView)

      const result = await executeTool("click", { x: -10, y: 200 })
      expect(result.success).toBe(false)
      expect(result.error).toContain("out of bounds")
    })

    it("should dispatch mouse events for valid click", async () => {
      const mockDebugger = {
        attach: vi.fn(),
        detach: vi.fn(),
        sendCommand: vi.fn().mockResolvedValue({}),
      }

      const mockView = createMockBrowserView({
        webContents: { debugger: mockDebugger },
        bounds: { x: 0, y: 0, width: 1280, height: 800 },
      })
      setBrowserView(mockView)

      const result = await executeTool("click", { x: 100, y: 200 })

      expect(result.success).toBe(true)
      expect(mockDebugger.attach).toHaveBeenCalledWith("1.3")
      expect(mockDebugger.sendCommand).toHaveBeenCalledWith("Input.dispatchMouseEvent", expect.objectContaining({
        type: "mousePressed",
        button: "left",
      }))
      expect(mockDebugger.sendCommand).toHaveBeenCalledWith("Input.dispatchMouseEvent", expect.objectContaining({
        type: "mouseReleased",
        button: "left",
      }))
      expect(mockDebugger.detach).toHaveBeenCalled()
    })
  })

  // ============================================================================
  // Type Tool
  // ============================================================================

  describe("type tool", () => {
    it("should return error when BrowserView not initialized", async () => {
      const result = await executeTool("type", { text: "hello" })
      expect(result.success).toBe(false)
      expect(result.error).toBe("BrowserView not initialized")
    })

    it("should return error when text is missing", async () => {
      const mockView = createMockBrowserView()
      setBrowserView(mockView)

      const result = await executeTool("type", {})
      expect(result.success).toBe(false)
      expect(result.error).toContain("requires text parameter")
    })

    it("should return error when focused element cannot receive text", async () => {
      const mockView = createMockBrowserView({
        webContents: {
          executeJavaScript: vi.fn().mockResolvedValue(false), // Cannot type
        },
      })
      setBrowserView(mockView)

      const result = await executeTool("type", { text: "hello" })
      expect(result.success).toBe(false)
      expect(result.error).toContain("cannot receive text input")
    })

    it("should insert text when focused element can receive input", async () => {
      const mockDebugger = {
        attach: vi.fn(),
        detach: vi.fn(),
        sendCommand: vi.fn().mockResolvedValue({}),
      }

      const mockView = createMockBrowserView({
        webContents: {
          executeJavaScript: vi.fn().mockResolvedValue(true), // Can type
          debugger: mockDebugger,
        },
      })
      setBrowserView(mockView)

      const result = await executeTool("type", { text: "hello world" })

      expect(result.success).toBe(true)
      expect(mockDebugger.sendCommand).toHaveBeenCalledWith("Input.insertText", { text: "hello world" })
    })
  })

  // ============================================================================
  // Scroll Tool
  // ============================================================================

  describe("scroll tool", () => {
    it("should return error when BrowserView not initialized", async () => {
      const result = await executeTool("scroll", { dy: 300 })
      expect(result.success).toBe(false)
      expect(result.error).toBe("BrowserView not initialized")
    })

    it("should return error when dy is missing", async () => {
      const mockView = createMockBrowserView()
      setBrowserView(mockView)

      const result = await executeTool("scroll", {})
      expect(result.success).toBe(false)
      expect(result.error).toContain("requires dy parameter")
    })

    it("should scroll page by specified amount", async () => {
      const executeJavaScript = vi.fn().mockResolvedValue(undefined)
      const mockView = createMockBrowserView({
        webContents: { executeJavaScript },
      })
      setBrowserView(mockView)

      const result = await executeTool("scroll", { dy: 300 })

      expect(result.success).toBe(true)
      expect(executeJavaScript).toHaveBeenCalledWith("window.scrollBy(0, 300)")
    })

    it("should support horizontal scrolling with dx", async () => {
      const executeJavaScript = vi.fn().mockResolvedValue(undefined)
      const mockView = createMockBrowserView({
        webContents: { executeJavaScript },
      })
      setBrowserView(mockView)

      const result = await executeTool("scroll", { dy: 300, dx: 100 })

      expect(result.success).toBe(true)
      expect(executeJavaScript).toHaveBeenCalledWith("window.scrollBy(100, 300)")
    })
  })

  // ============================================================================
  // Press Key Tool
  // ============================================================================

  describe("press_key tool", () => {
    it("should return error when BrowserView not initialized", async () => {
      const result = await executeTool("press_key", { key: "Tab" })
      expect(result.success).toBe(false)
      expect(result.error).toBe("BrowserView not initialized")
    })

    it("should return error when key is missing", async () => {
      const mockView = createMockBrowserView()
      setBrowserView(mockView)

      const result = await executeTool("press_key", {})
      expect(result.success).toBe(false)
      expect(result.error).toContain("requires key parameter")
    })

    it("should return error for unknown key", async () => {
      const mockView = createMockBrowserView()
      setBrowserView(mockView)

      const result = await executeTool("press_key", { key: "InvalidKey" })
      expect(result.success).toBe(false)
      expect(result.error).toContain("Unknown key")
      expect(result.error).toContain("Valid keys")
    })

    it.each([
      ["Tab", 9],
      ["Enter", 13],
      ["Escape", 27],
      ["Backspace", 8],
      ["ArrowDown", 40],
      ["ArrowUp", 38],
      ["ArrowLeft", 37],
      ["ArrowRight", 39],
      ["Space", 32],
    ])("should dispatch key event for %s", async (key, expectedKeyCode) => {
      const mockDebugger = {
        attach: vi.fn(),
        detach: vi.fn(),
        sendCommand: vi.fn().mockResolvedValue({}),
      }

      const mockView = createMockBrowserView({
        webContents: { debugger: mockDebugger },
      })
      setBrowserView(mockView)

      const result = await executeTool("press_key", { key })

      expect(result.success).toBe(true)
      expect(mockDebugger.sendCommand).toHaveBeenCalledWith("Input.dispatchKeyEvent", expect.objectContaining({
        type: "keyDown",
        windowsVirtualKeyCode: expectedKeyCode,
      }))
      expect(mockDebugger.sendCommand).toHaveBeenCalledWith("Input.dispatchKeyEvent", expect.objectContaining({
        type: "keyUp",
        windowsVirtualKeyCode: expectedKeyCode,
      }))
    })

    it("should handle SelectAll (Ctrl+A on Windows/Linux, Cmd+A on macOS)", async () => {
      const mockDebugger = {
        attach: vi.fn(),
        detach: vi.fn(),
        sendCommand: vi.fn().mockResolvedValue({}),
      }

      const mockView = createMockBrowserView({
        webContents: { debugger: mockDebugger },
      })
      setBrowserView(mockView)

      const result = await executeTool("press_key", { key: "SelectAll" })

      expect(result.success).toBe(true)
      // Should send modifier keyDown, 'a' keyDown, 'a' keyUp, modifier keyUp
      expect(mockDebugger.sendCommand).toHaveBeenCalledTimes(4)

      // Verify correct modifier key based on platform
      const isMac = process.platform === "darwin"
      const expectedModKey = isMac ? "Meta" : "Control"
      expect(mockDebugger.sendCommand).toHaveBeenCalledWith(
        "Input.dispatchKeyEvent",
        expect.objectContaining({ key: expectedModKey, type: "keyDown" })
      )
    })

    it("should also work with keypress alias", async () => {
      const mockDebugger = {
        attach: vi.fn(),
        detach: vi.fn(),
        sendCommand: vi.fn().mockResolvedValue({}),
      }

      const mockView = createMockBrowserView({
        webContents: { debugger: mockDebugger },
      })
      setBrowserView(mockView)

      const result = await executeTool("keypress", { key: "Enter" })

      expect(result.success).toBe(true)
    })
  })

  // ============================================================================
  // Done Tool
  // ============================================================================

  describe("done tool", () => {
    it("should return success with default summary", async () => {
      const result = await executeTool("done", {})

      expect(result.success).toBe(true)
      expect((result.data as { summary: string }).summary).toBe("Form filling completed")
      expect((result.data as { completed: boolean }).completed).toBe(true)
    })

    it("should return success with custom summary", async () => {
      const result = await executeTool("done", { summary: "Filled all 10 fields successfully" })

      expect(result.success).toBe(true)
      expect((result.data as { summary: string }).summary).toBe("Filled all 10 fields successfully")
    })
  })

  // ============================================================================
  // Timeout Handling
  // ============================================================================

  describe("timeout handling", () => {
    it("should timeout long-running tools", async () => {
      // Create a mock that never resolves
      const mockView = createMockBrowserView({
        webContents: {
          capturePage: vi.fn().mockReturnValue(new Promise(() => {})), // Never resolves
        },
      })
      setBrowserView(mockView)

      // Override timeout for test
      vi.useFakeTimers()

      const resultPromise = executeTool("screenshot", {})

      // Fast-forward past the timeout
      vi.advanceTimersByTime(31000)

      vi.useRealTimers()

      const result = await resultPromise
      expect(result.success).toBe(false)
      expect(result.error).toContain("timed out")
    }, 35000)
  })
})
