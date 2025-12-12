import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// We need to mock modules before any imports that use them
const mockCallTool = vi.fn()
const mockSetRequestHandler = vi.fn()
const mockConnect = vi.fn().mockResolvedValue(undefined)
const mockServerInstance = {
  setRequestHandler: mockSetRequestHandler,
  connect: mockConnect,
}
const MockServer = vi.fn(() => mockServerInstance)
const MockStdioServerTransport = vi.fn()

vi.mock("./electron-client.js", () => ({
  callTool: mockCallTool,
}))

vi.mock("@modelcontextprotocol/sdk/server/index.js", () => ({
  Server: MockServer,
}))

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport: MockStdioServerTransport,
}))

vi.mock("@modelcontextprotocol/sdk/types.js", () => ({
  ListToolsRequestSchema: { method: "tools/list" },
  CallToolRequestSchema: { method: "tools/call" },
}))

import { tools } from "./tools.js"

describe("MCP Server", () => {
  let listToolsHandler: (request: unknown) => Promise<unknown>
  let callToolHandler: (request: unknown) => Promise<unknown>

  beforeEach(async () => {
    vi.clearAllMocks()
    mockCallTool.mockReset()
    MockServer.mockClear()
    mockSetRequestHandler.mockClear()

    // Capture the handlers when they're registered
    mockSetRequestHandler.mockImplementation((schema: { method: string }, handler: (request: unknown) => Promise<unknown>) => {
      if (schema.method === "tools/list") {
        listToolsHandler = handler
      } else if (schema.method === "tools/call") {
        callToolHandler = handler
      }
    })

    // Reset modules and re-import to trigger initialization
    vi.resetModules()

    // Re-setup mocks after reset
    vi.doMock("./electron-client.js", () => ({
      callTool: mockCallTool,
    }))
    vi.doMock("@modelcontextprotocol/sdk/server/index.js", () => ({
      Server: MockServer,
    }))
    vi.doMock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
      StdioServerTransport: MockStdioServerTransport,
    }))
    vi.doMock("@modelcontextprotocol/sdk/types.js", () => ({
      ListToolsRequestSchema: { method: "tools/list" },
      CallToolRequestSchema: { method: "tools/call" },
    }))

    await import("./index.js")
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("server initialization", () => {
    it("should create server with correct name and version", () => {
      expect(MockServer).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "job-applicator",
          version: "1.0.0",
        }),
        expect.any(Object)
      )
    })

    it("should register tools/list handler", () => {
      expect(mockSetRequestHandler).toHaveBeenCalledWith(
        expect.objectContaining({ method: "tools/list" }),
        expect.any(Function)
      )
    })

    it("should register tools/call handler", () => {
      expect(mockSetRequestHandler).toHaveBeenCalledWith(
        expect.objectContaining({ method: "tools/call" }),
        expect.any(Function)
      )
    })
  })

  describe("tools/list handler", () => {
    it("should return all tools", async () => {
      const result = await listToolsHandler({})
      expect(result).toEqual({ tools })
    })
  })

  describe("tools/call handler", () => {
    it("should call tool with name and arguments", async () => {
      mockCallTool.mockResolvedValue({
        success: true,
        data: { clicked: true },
      })

      await callToolHandler({
        params: {
          name: "click",
          arguments: { x: 100, y: 200 },
        },
      })

      expect(mockCallTool).toHaveBeenCalledWith("click", { x: 100, y: 200 })
    })

    it("should use empty object when arguments not provided", async () => {
      mockCallTool.mockResolvedValue({
        success: true,
        data: {},
      })

      await callToolHandler({
        params: {
          name: "screenshot",
        },
      })

      expect(mockCallTool).toHaveBeenCalledWith("screenshot", {})
    })

    it("should return image content for screenshot results", async () => {
      mockCallTool.mockResolvedValue({
        success: true,
        data: {
          image: "data:image/jpeg;base64,/9j/4AAQ...",
          width: 1280,
          height: 720,
          hash: "abc123",
        },
      })

      const result = await callToolHandler({
        params: { name: "screenshot", arguments: {} },
      })

      expect(result).toEqual({
        content: [
          {
            type: "image",
            data: "/9j/4AAQ...",
            mimeType: "image/jpeg",
          },
          {
            type: "text",
            text: JSON.stringify({ width: 1280, height: 720, hash: "abc123" }),
          },
        ],
      })
    })

    it("should strip base64 prefix from image data", async () => {
      mockCallTool.mockResolvedValue({
        success: true,
        data: {
          image: "data:image/png;base64,iVBORw0KGgo=",
          width: 100,
          height: 100,
        },
      })

      const result = (await callToolHandler({
        params: { name: "screenshot", arguments: {} },
      })) as { content: Array<{ type: string; data?: string }> }

      expect(result.content[0].data).toBe("iVBORw0KGgo=")
    })

    it("should return JSON text for non-image data", async () => {
      mockCallTool.mockResolvedValue({
        success: true,
        data: {
          url: "https://example.com/jobs",
          title: "Apply Now",
        },
      })

      const result = await callToolHandler({
        params: { name: "get_page_info", arguments: {} },
      })

      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              url: "https://example.com/jobs",
              title: "Apply Now",
            }),
          },
        ],
      })
    })

    it("should return error content on failure", async () => {
      mockCallTool.mockResolvedValue({
        success: false,
        error: "BrowserView not initialized",
      })

      const result = await callToolHandler({
        params: { name: "screenshot", arguments: {} },
      })

      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: "BrowserView not initialized" }),
          },
        ],
        isError: true,
      })
    })

    it("should return simple success for empty data", async () => {
      mockCallTool.mockResolvedValue({
        success: true,
      })

      const result = await callToolHandler({
        params: { name: "done", arguments: { summary: "Complete" } },
      })

      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: true }),
          },
        ],
      })
    })

    it("should handle form fields data", async () => {
      const formFields = [
        { label: "Name", type: "text", value: "", x: 100, y: 200 },
        { label: "Email", type: "email", value: "", x: 100, y: 250 },
      ]
      mockCallTool.mockResolvedValue({
        success: true,
        data: { fields: formFields },
      })

      const result = (await callToolHandler({
        params: { name: "get_form_fields", arguments: {} },
      })) as { content: Array<{ text: string }> }

      expect(result.content[0].text).toBe(JSON.stringify({ fields: formFields }))
    })

    it("should handle done tool with summary", async () => {
      mockCallTool.mockResolvedValue({
        success: true,
        data: { summary: "Filled name, email, phone" },
      })

      const result = (await callToolHandler({
        params: { name: "done", arguments: { summary: "Filled name, email, phone" } },
      })) as { content: Array<{ text: string }> }

      expect(result.content[0].text).toContain("Filled name, email, phone")
    })
  })

  describe("all tool types", () => {
    it.each([
      ["screenshot", {}],
      ["click", { x: 50, y: 100 }],
      ["type", { text: "Hello World" }],
      ["press_key", { key: "Tab" }],
      ["scroll", { dy: 300 }],
      ["get_form_fields", {}],
      ["get_page_info", {}],
      ["generate_resume", {}],
      ["generate_cover_letter", {}],
      ["upload_file", { type: "resume" }],
      ["done", { summary: "Complete" }],
    ])("should handle %s tool call", async (toolName, args) => {
      mockCallTool.mockResolvedValue({ success: true })

      await callToolHandler({
        params: { name: toolName, arguments: args },
      })

      expect(mockCallTool).toHaveBeenCalledWith(toolName, args)
    })
  })
})
