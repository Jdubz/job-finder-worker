import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { callTool, type ToolResult } from "./electron-client.js"

// Mock global fetch
const mockFetch = vi.fn()
global.fetch = mockFetch as unknown as typeof fetch

describe("Electron Client", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("callTool", () => {
    it("should make POST request to tool server", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: { test: "result" } }),
      })

      const result = await callTool("screenshot", {})

      expect(mockFetch).toHaveBeenCalledWith(
        "http://127.0.0.1:19524/tool",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tool: "screenshot", params: {} }),
        })
      )
    })

    it("should return successful result from server", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: { image: "base64data", width: 1280, height: 720 },
        }),
      })

      const result = await callTool("screenshot", {})

      expect(result.success).toBe(true)
      expect(result.data).toEqual({ image: "base64data", width: 1280, height: 720 })
    })

    it("should pass params to server", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      })

      await callTool("click", { x: 100, y: 200 })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({ tool: "click", params: { x: 100, y: 200 } }),
        })
      )
    })

    it("should handle HTTP error responses", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => "Internal Server Error",
      })

      const result = await callTool("screenshot", {})

      expect(result.success).toBe(false)
      expect(result.error).toContain("500")
      expect(result.error).toContain("Internal Server Error")
    })

    it("should handle connection refused errors", async () => {
      const error = new Error("fetch failed")
      error.message = "fetch failed: ECONNREFUSED"
      mockFetch.mockRejectedValue(error)

      const result = await callTool("screenshot", {})

      expect(result.success).toBe(false)
      expect(result.error).toContain("Cannot connect to Electron app")
    })

    it("should handle generic network errors", async () => {
      mockFetch.mockRejectedValue(new Error("Network error"))

      const result = await callTool("screenshot", {})

      expect(result.success).toBe(false)
      expect(result.error).toContain("Failed to call tool")
      expect(result.error).toContain("Network error")
    })

    it("should handle timeout errors", async () => {
      const abortError = new Error("The operation was aborted")
      abortError.name = "AbortError"
      mockFetch.mockRejectedValue(abortError)

      const result = await callTool("generate_resume", {})

      expect(result.success).toBe(false)
      expect(result.error).toContain("timed out")
    })

    it("should include abort signal for timeout", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      })

      await callTool("screenshot", {})

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        })
      )
    })

    it("should return error result from server", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: false,
          error: "BrowserView not initialized",
        }),
      })

      const result = await callTool("screenshot", {})

      expect(result.success).toBe(false)
      expect(result.error).toBe("BrowserView not initialized")
    })

    it("should use custom URL from environment variable", async () => {
      // Save original env
      const originalEnv = process.env.JOB_APPLICATOR_URL

      try {
        process.env.JOB_APPLICATOR_URL = "http://custom-host:9999"

        // Need to re-import to pick up new env
        vi.resetModules()
        const { callTool: callToolWithCustomUrl } = await import("./electron-client.js")

        mockFetch.mockResolvedValue({
          ok: true,
          json: async () => ({ success: true }),
        })

        await callToolWithCustomUrl("screenshot", {})

        expect(mockFetch).toHaveBeenCalledWith(
          "http://custom-host:9999/tool",
          expect.any(Object)
        )
      } finally {
        // Restore original env
        if (originalEnv === undefined) {
          delete process.env.JOB_APPLICATOR_URL
        } else {
          process.env.JOB_APPLICATOR_URL = originalEnv
        }
        vi.resetModules()
      }
    })
  })

  describe("all supported tools", () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      })
    })

    it.each([
      ["screenshot", {}],
      ["click", { x: 100, y: 200 }],
      ["type", { text: "hello" }],
      ["press_key", { key: "Tab" }],
      ["scroll", { dy: 300 }],
      ["get_form_fields", {}],
      ["get_page_info", {}],
      ["generate_resume", {}],
      ["generate_cover_letter", {}],
      ["upload_file", { type: "resume" }],
      ["done", { summary: "Complete" }],
    ])("should call %s tool with params", async (tool, params) => {
      await callTool(tool, params)

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({ tool, params }),
        })
      )
    })
  })
})
