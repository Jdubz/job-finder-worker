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

import { startToolServer, stopToolServer } from "./tool-server.js"

// Helper to make HTTP requests to the tool server
async function makeRequest(
  method: string,
  path: string,
  body?: object
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const options: http.RequestOptions = {
      hostname: "127.0.0.1",
      port: 19524,
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
  })

  afterEach(async () => {
    if (server) {
      await stopToolServer()
      server = null
    }
  })

  describe("server lifecycle", () => {
    it("should start and listen on port 19524", async () => {
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

    it("should stop server cleanly", async () => {
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
          port: 19524,
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

    it("should execute tool and return result", async () => {
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

    it("should handle tool execution errors", async () => {
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
          port: 19524,
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

    it("should use empty object for params if not provided", async () => {
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
          port: 19524,
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
})
