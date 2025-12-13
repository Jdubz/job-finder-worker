import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as http from "http"

// Use vi.hoisted to create mocks that are available when vi.mock runs
const { mockExecuteTool, mockLogger } = vi.hoisted(() => ({
  mockExecuteTool: vi.fn(),
  mockLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

// Mock logger
vi.mock("./logger.js", () => ({
  logger: mockLogger,
}))

// Mock tool-executor
vi.mock("./tool-executor.js", () => ({
  executeTool: mockExecuteTool,
}))

import { startToolServer, stopToolServer, setToolStatusCallback, setToolServerPort, formatToolResult } from "./tool-server.js"

// Use a different port for tests to avoid conflicts with running app
const TEST_PORT = 19525

// Helper to make HTTP requests to the tool server
async function makeRequest(
  method: string,
  path: string,
  body?: object
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const options: http.RequestOptions = {
      hostname: "127.0.0.1",
      port: TEST_PORT,
      path,
      method,
      headers: {
        "Content-Type": "application/json",
      },
    }

    const req = http.request(options, (res) => {
      let data = ""
      res.on("data", (chunk) => {
        data += chunk
      })
      res.on("end", () => {
        try {
          const parsedBody = data ? JSON.parse(data) : null
          resolve({ status: res.statusCode || 0, body: parsedBody })
        } catch {
          resolve({ status: res.statusCode || 0, body: data })
        }
      })
    })

    req.on("error", reject)

    if (body) {
      req.write(JSON.stringify(body))
    }
    req.end()
  })
}

describe("Tool Server", () => {
  let server: http.Server | null = null

  beforeEach(() => {
    vi.clearAllMocks()
    mockExecuteTool.mockReset()
    // Reset status callback to ensure test isolation
    setToolStatusCallback(null)
    // Use test port to avoid conflicts with running app
    setToolServerPort(TEST_PORT)
  })

  afterEach(async () => {
    if (server) {
      await stopToolServer()
      server = null
    }
  })

  describe("server lifecycle", () => {
    it("should start and listen on configured port", async () => {
      mockExecuteTool.mockResolvedValue({ success: true })
      server = startToolServer()

      // Give server time to start
      await new Promise((resolve) => setTimeout(resolve, 100))

      // Try to connect
      const response = await makeRequest("POST", "/tool", { tool: "done", params: {} })
      expect(response.status).toBe(200)
    })

    it("should return existing server if already running", () => {
      server = startToolServer()
      const server2 = startToolServer()
      expect(server2).toBe(server)
    })

    // TODO: Fix test - server.close() doesn't immediately release port, causing race condition
    it.skip("should stop server cleanly", async () => {
      server = startToolServer()
      await new Promise((resolve) => setTimeout(resolve, 100))

      await stopToolServer()
      server = null

      // Server should no longer accept connections
      await expect(makeRequest("POST", "/tool", {})).rejects.toThrow()
    })
  })

  describe("HTTP endpoints", () => {
    beforeEach(async () => {
      server = startToolServer()
      await new Promise((resolve) => setTimeout(resolve, 100))
    })

    it("should return 404 for non-/tool paths", async () => {
      const response = await makeRequest("POST", "/other", {})
      expect(response.status).toBe(404)
      expect((response.body as { success: boolean }).success).toBe(false)
      expect((response.body as { error: string }).error).toBe("Not found")
    })

    it("should return 404 for non-POST methods", async () => {
      const response = await makeRequest("GET", "/tool", undefined)
      expect(response.status).toBe(404)
    })

    it("should handle OPTIONS for CORS preflight", async () => {
      const response = await new Promise<{ status: number; headers: http.IncomingHttpHeaders }>((resolve, reject) => {
        const req = http.request({
          hostname: "127.0.0.1",
          port: TEST_PORT,
          path: "/tool",
          method: "OPTIONS",
        }, (res) => {
          resolve({ status: res.statusCode || 0, headers: res.headers })
        })
        req.on("error", reject)
        req.end()
      })

      expect(response.status).toBe(204)
    })

    it("should return 400 when tool name is missing", async () => {
      const response = await makeRequest("POST", "/tool", { params: {} })
      expect(response.status).toBe(400)
      expect((response.body as { error: string }).error).toBe("Missing tool name")
    })

    it("should return 400 when tool name is not a string", async () => {
      const response = await makeRequest("POST", "/tool", { tool: 123, params: {} })
      expect(response.status).toBe(400)
      expect((response.body as { error: string }).error).toBe("Missing tool name")
    })

    // TODO: Fix ESM module mocking - vi.mock doesn't properly intercept tool-executor import
    it.skip("should execute tool and return result", async () => {
      mockExecuteTool.mockResolvedValue({
        success: true,
        data: { summary: "Done" },
      })

      const response = await makeRequest("POST", "/tool", {
        tool: "done",
        params: { summary: "Test complete" },
      })

      expect(response.status).toBe(200)
      expect((response.body as { success: boolean }).success).toBe(true)
      expect((response.body as { data: { summary: string } }).data.summary).toBe("Done")
      expect(mockExecuteTool).toHaveBeenCalledWith("done", { summary: "Test complete" })
    })

    // TODO: Fix ESM module mocking - vi.mock doesn't properly intercept tool-executor import
    it.skip("should handle tool execution errors", async () => {
      mockExecuteTool.mockResolvedValue({
        success: false,
        error: "BrowserView not initialized",
      })

      const response = await makeRequest("POST", "/tool", {
        tool: "screenshot",
        params: {},
      })

      expect(response.status).toBe(200)
      expect((response.body as { success: boolean }).success).toBe(false)
      expect((response.body as { error: string }).error).toBe("BrowserView not initialized")
    })

    it("should handle JSON parse errors", async () => {
      const response = await new Promise<{ status: number; body: unknown }>((resolve, reject) => {
        const req = http.request({
          hostname: "127.0.0.1",
          port: TEST_PORT,
          path: "/tool",
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }, (res) => {
          let data = ""
          res.on("data", (chunk) => { data += chunk })
          res.on("end", () => {
            resolve({ status: res.statusCode || 0, body: JSON.parse(data) })
          })
        })
        req.on("error", reject)
        req.write("not valid json")
        req.end()
      })

      expect(response.status).toBe(500)
      expect((response.body as { success: boolean }).success).toBe(false)
    })

    // TODO: Fix ESM module mocking - vi.mock doesn't properly intercept tool-executor import
    it.skip("should use empty object for params if not provided", async () => {
      mockExecuteTool.mockResolvedValue({ success: true })

      const response = await makeRequest("POST", "/tool", { tool: "screenshot" })

      expect(response.status).toBe(200)
      expect(mockExecuteTool).toHaveBeenCalledWith("screenshot", {})
    })

    it("should set CORS headers", async () => {
      mockExecuteTool.mockResolvedValue({ success: true })

      const response = await new Promise<{ headers: http.IncomingHttpHeaders }>((resolve, reject) => {
        const req = http.request({
          hostname: "127.0.0.1",
          port: TEST_PORT,
          path: "/tool",
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }, (res) => {
          resolve({ headers: res.headers })
        })
        req.on("error", reject)
        req.write(JSON.stringify({ tool: "done", params: {} }))
        req.end()
      })

      expect(response.headers["access-control-allow-origin"]).toBe("*")
      expect(response.headers["access-control-allow-methods"]).toBe("POST, OPTIONS")
    })
  })

  describe("request body size limit", () => {
    beforeEach(async () => {
      server = startToolServer()
      await new Promise((resolve) => setTimeout(resolve, 100))
    })

    it("should reject requests larger than 1MB", async () => {
      // Create a very large payload
      const largePayload = {
        tool: "type",
        params: { text: "x".repeat(1024 * 1024 + 1) }, // > 1MB
      }

      const response = await makeRequest("POST", "/tool", largePayload)

      expect(response.status).toBe(413)
      expect((response.body as { error: string }).error).toBe("Request too large")
    })
  })

  describe("formatToolResult", () => {
    it("should format get_user_profile result", () => {
      expect(formatToolResult("get_user_profile", undefined, undefined)).toBe("loaded profile")
    })

    it("should format get_form_fields result with field count", () => {
      const data = { fields: [{}, {}, {}] }
      expect(formatToolResult("get_form_fields", undefined, data)).toBe("found 3 fields")
    })

    it("should format get_form_fields result with empty fields", () => {
      expect(formatToolResult("get_form_fields", undefined, { fields: [] })).toBe("found 0 fields")
      expect(formatToolResult("get_form_fields", undefined, undefined)).toBe("found 0 fields")
    })

    it("should format fill_field result with selector and value", () => {
      const params = { selector: "#email", value: "test@example.com" }
      expect(formatToolResult("fill_field", params, undefined)).toBe('"#email" = "test@example.com"')
    })

    it("should truncate long fill_field values", () => {
      const params = { selector: "#bio", value: "This is a very long text that should be truncated" }
      // Truncates to 30 chars
      expect(formatToolResult("fill_field", params, undefined)).toBe('"#bio" = "This is a very long text that "')
    })

    it("should format select_option result", () => {
      const params = { selector: "#country", value: "US" }
      expect(formatToolResult("select_option", params, undefined)).toBe('"#country" = "US"')
    })

    it("should format select_combobox result", () => {
      const params = { selector: "#month", value: "March" }
      expect(formatToolResult("select_combobox", params, undefined)).toBe('"#month" → "March"')
    })

    it("should format set_checkbox result", () => {
      const params = { selector: "#agree", checked: true }
      expect(formatToolResult("set_checkbox", params, undefined)).toBe('"#agree" = true')
    })

    it("should format click_element result", () => {
      const params = { selector: "#submit" }
      expect(formatToolResult("click_element", params, undefined)).toBe('clicked "#submit"')
    })

    it("should format click result with coordinates", () => {
      const params = { x: 100, y: 200 }
      expect(formatToolResult("click", params, undefined)).toBe("at (100, 200)")
    })

    it("should format type result with text", () => {
      const params = { text: "Hello World" }
      expect(formatToolResult("type", params, undefined)).toBe('"Hello World"')
    })

    it("should truncate long type text", () => {
      const params = { text: "This is a very long text that should be truncated at 30 chars" }
      // Truncates to 30 chars
      expect(formatToolResult("type", params, undefined)).toBe('"This is a very long text that "')
    })

    it("should format scroll result", () => {
      const params = { dy: 300 }
      expect(formatToolResult("scroll", params, undefined)).toBe("300px")
    })

    it("should format screenshot result", () => {
      expect(formatToolResult("screenshot", undefined, undefined)).toBe("captured")
    })

    it("should format get_buttons result", () => {
      const data = { buttons: [{}, {}] }
      expect(formatToolResult("get_buttons", undefined, data)).toBe("found 2 buttons")
    })

    it("should format get_page_info result", () => {
      expect(formatToolResult("get_page_info", undefined, undefined)).toBe("loaded")
    })

    it("should format get_job_context result", () => {
      expect(formatToolResult("get_job_context", undefined, undefined)).toBe("loaded")
    })

    it("should format done result with summary", () => {
      const params = { summary: "Filled 5 fields" }
      expect(formatToolResult("done", params, undefined)).toBe("Filled 5 fields")
    })

    it("should return default for unknown tools", () => {
      expect(formatToolResult("unknown_tool", undefined, undefined)).toBe("done")
    })

    it("should handle missing params gracefully", () => {
      expect(formatToolResult("fill_field", undefined, undefined)).toBe('"?" = ""')
      expect(formatToolResult("click", undefined, undefined)).toBe("at (?, ?)")
    })
  })

  describe("status callback", () => {
    beforeEach(async () => {
      server = startToolServer()
      await new Promise((resolve) => setTimeout(resolve, 100))
    })

    it("should call status callback on tool execution", async () => {
      const statusMessages: string[] = []
      setToolStatusCallback((msg) => statusMessages.push(msg))

      mockExecuteTool.mockResolvedValue({ success: true, data: { fields: [{}, {}] } })

      await makeRequest("POST", "/tool", { tool: "get_form_fields", params: {} })

      // Should have received both starting and completion status
      expect(statusMessages.length).toBe(2)
      expect(statusMessages[0]).toBe("🔧 get_form_fields...")
      expect(statusMessages[1]).toBe("✓ get_form_fields: found 2 fields")
    })

    it("should send error status on failure", async () => {
      const statusMessages: string[] = []
      setToolStatusCallback((msg) => statusMessages.push(msg))

      mockExecuteTool.mockResolvedValue({ success: false, error: "Something went wrong" })

      await makeRequest("POST", "/tool", { tool: "fill_field", params: { selector: "#test", value: "test" } })

      expect(statusMessages.length).toBe(2)
      expect(statusMessages[0]).toBe("🔧 fill_field...")
      expect(statusMessages[1]).toBe("✗ fill_field: Something went wrong")
    })

    it("should not crash when no status callback is set", async () => {
      setToolStatusCallback(null)
      mockExecuteTool.mockResolvedValue({ success: true })

      const response = await makeRequest("POST", "/tool", { tool: "screenshot", params: {} })

      expect(response.status).toBe(200)
    })
  })
})
