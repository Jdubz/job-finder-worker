import { describe, it, expect } from "vitest"
import { tools } from "./tools.js"

describe("MCP Tool Definitions", () => {
  describe("tool array", () => {
    it("should export an array of tools", () => {
      expect(Array.isArray(tools)).toBe(true)
      expect(tools.length).toBeGreaterThan(0)
    })

    it("should have all expected tools", () => {
      const toolNames = tools.map((t) => t.name)
      expect(toolNames).toContain("screenshot")
      expect(toolNames).toContain("click")
      expect(toolNames).toContain("type")
      expect(toolNames).toContain("press_key")
      expect(toolNames).toContain("scroll")
      expect(toolNames).toContain("get_form_fields")
      expect(toolNames).toContain("get_page_info")
      expect(toolNames).toContain("generate_resume")
      expect(toolNames).toContain("generate_cover_letter")
      expect(toolNames).toContain("upload_file")
      expect(toolNames).toContain("done")
    })

    it("should have unique tool names", () => {
      const names = tools.map((t) => t.name)
      const uniqueNames = [...new Set(names)]
      expect(names.length).toBe(uniqueNames.length)
    })
  })

  describe("tool schema validation", () => {
    it.each(tools)("$name should have valid structure", (tool) => {
      expect(tool.name).toBeDefined()
      expect(typeof tool.name).toBe("string")
      expect(tool.name.length).toBeGreaterThan(0)

      expect(tool.description).toBeDefined()
      expect(typeof tool.description).toBe("string")
      expect(tool.description.length).toBeGreaterThan(0)

      expect(tool.inputSchema).toBeDefined()
      expect(tool.inputSchema.type).toBe("object")
      expect(tool.inputSchema.properties).toBeDefined()
      expect(Array.isArray(tool.inputSchema.required)).toBe(true)
    })
  })

  describe("screenshot tool", () => {
    const tool = tools.find((t) => t.name === "screenshot")!

    it("should require no parameters", () => {
      expect(tool.inputSchema.required).toEqual([])
      expect(Object.keys(tool.inputSchema.properties as object)).toHaveLength(0)
    })

    it("should have descriptive help text", () => {
      expect(tool.description).toContain("screenshot")
      expect(tool.description).toContain("base64")
    })
  })

  describe("click tool", () => {
    const tool = tools.find((t) => t.name === "click")!

    it("should require x and y coordinates", () => {
      expect(tool.inputSchema.required).toContain("x")
      expect(tool.inputSchema.required).toContain("y")
    })

    it("should define x and y as numbers", () => {
      const props = tool.inputSchema.properties as Record<string, { type: string }>
      expect(props.x.type).toBe("number")
      expect(props.y.type).toBe("number")
    })
  })

  describe("type tool", () => {
    const tool = tools.find((t) => t.name === "type")!

    it("should require text parameter", () => {
      expect(tool.inputSchema.required).toContain("text")
    })

    it("should define text as string", () => {
      const props = tool.inputSchema.properties as Record<string, { type: string }>
      expect(props.text.type).toBe("string")
    })
  })

  describe("press_key tool", () => {
    const tool = tools.find((t) => t.name === "press_key")!

    it("should require key parameter", () => {
      expect(tool.inputSchema.required).toContain("key")
    })

    it("should have enum of supported keys", () => {
      const props = tool.inputSchema.properties as Record<string, { type: string; enum: string[] }>
      expect(props.key.enum).toBeDefined()
      expect(props.key.enum).toContain("Tab")
      expect(props.key.enum).toContain("Enter")
      expect(props.key.enum).toContain("Escape")
      expect(props.key.enum).toContain("Backspace")
      expect(props.key.enum).toContain("ArrowDown")
      expect(props.key.enum).toContain("ArrowUp")
      expect(props.key.enum).toContain("ArrowLeft")
      expect(props.key.enum).toContain("ArrowRight")
      expect(props.key.enum).toContain("Space")
      expect(props.key.enum).toContain("SelectAll")
    })
  })

  describe("scroll tool", () => {
    const tool = tools.find((t) => t.name === "scroll")!

    it("should require dy parameter", () => {
      expect(tool.inputSchema.required).toContain("dy")
    })

    it("should define dy as number", () => {
      const props = tool.inputSchema.properties as Record<string, { type: string }>
      expect(props.dy.type).toBe("number")
    })

    it("should mention positive/negative in description", () => {
      expect(tool.description).toContain("positive")
      expect(tool.description).toContain("negative")
    })
  })

  describe("get_form_fields tool", () => {
    const tool = tools.find((t) => t.name === "get_form_fields")!

    it("should require no parameters", () => {
      expect(tool.inputSchema.required).toEqual([])
    })
  })

  describe("get_page_info tool", () => {
    const tool = tools.find((t) => t.name === "get_page_info")!

    it("should require no parameters", () => {
      expect(tool.inputSchema.required).toEqual([])
    })

    it("should mention URL and title", () => {
      expect(tool.description).toContain("URL")
      expect(tool.description).toContain("title")
    })
  })

  describe("generate_resume tool", () => {
    const tool = tools.find((t) => t.name === "generate_resume")!

    it("should require no parameters", () => {
      expect(tool.inputSchema.required).toEqual([])
    })

    it("should mention PDF in description", () => {
      expect(tool.description).toContain("PDF")
    })
  })

  describe("generate_cover_letter tool", () => {
    const tool = tools.find((t) => t.name === "generate_cover_letter")!

    it("should require no parameters", () => {
      expect(tool.inputSchema.required).toEqual([])
    })

    it("should mention PDF in description", () => {
      expect(tool.description).toContain("PDF")
    })
  })

  describe("upload_file tool", () => {
    const tool = tools.find((t) => t.name === "upload_file")!

    it("should require type parameter", () => {
      expect(tool.inputSchema.required).toContain("type")
    })

    it("should have enum for file types", () => {
      const props = tool.inputSchema.properties as Record<string, { type: string; enum: string[] }>
      expect(props.type.enum).toContain("resume")
      expect(props.type.enum).toContain("coverLetter")
    })
  })

  describe("done tool", () => {
    const tool = tools.find((t) => t.name === "done")!

    it("should require summary parameter", () => {
      expect(tool.inputSchema.required).toContain("summary")
    })

    it("should define summary as string", () => {
      const props = tool.inputSchema.properties as Record<string, { type: string }>
      expect(props.summary.type).toBe("string")
    })

    it("should warn about not clicking submit", () => {
      expect(tool.description).toContain("DO NOT")
      expect(tool.description.toLowerCase()).toContain("submit")
    })
  })
})
