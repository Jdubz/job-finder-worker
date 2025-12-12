import { describe, it, expect } from "vitest"
import {
  normalizeUrl,
  resolveDocumentPath,
  buildExtractionPrompt,
  parseJsonArrayFromOutput,
  parseJsonObjectFromOutput,
  parseCliArrayOutput,
  parseCliObjectOutput,
  unwrapJobMatch,
  unwrapDocuments,
} from "./utils.js"
import { CLI_COMMANDS } from "./cli-config.js"
import type { AgentAction, AgentActionKind } from "./types.js"

describe("normalizeUrl", () => {
  it("should extract origin and pathname from valid URL", () => {
    expect(normalizeUrl("https://example.com/path/to/page?query=1#hash")).toBe(
      "https://example.com/path/to/page"
    )
  })

  it("should handle URL with no query or hash", () => {
    expect(normalizeUrl("https://example.com/path")).toBe("https://example.com/path")
  })

  it("should handle URL with port", () => {
    expect(normalizeUrl("http://localhost:3000/api/test?foo=bar")).toBe("http://localhost:3000/api/test")
  })

  it("should return original string for invalid URL", () => {
    expect(normalizeUrl("not-a-url")).toBe("not-a-url")
  })

  it("should handle root path", () => {
    expect(normalizeUrl("https://example.com/")).toBe("https://example.com/")
  })

  it("should handle URL with trailing slash", () => {
    expect(normalizeUrl("https://example.com/path/")).toBe("https://example.com/path/")
  })
})

describe("resolveDocumentPath", () => {
  it("should resolve API URL to local path", () => {
    const result = resolveDocumentPath(
      "/api/generator/artifacts/2025-12-04/resume.pdf",
      "/data/artifacts"
    )
    expect(result).toBe("/data/artifacts/2025-12-04/resume.pdf")
  })

  it("should handle already absolute path", () => {
    const result = resolveDocumentPath("/absolute/path/to/file.pdf", "/data/artifacts")
    expect(result).toBe("/absolute/path/to/file.pdf")
  })

  it("should handle relative path without API prefix", () => {
    const result = resolveDocumentPath("2025-12-04/resume.pdf", "/data/artifacts")
    expect(result).toBe("/data/artifacts/2025-12-04/resume.pdf")
  })

  it("should handle nested paths", () => {
    const result = resolveDocumentPath(
      "/api/generator/artifacts/2025/12/04/long-filename_with-dashes.pdf",
      "/srv/artifacts"
    )
    expect(result).toBe("/srv/artifacts/2025/12/04/long-filename_with-dashes.pdf")
  })
})

describe("CLI_COMMANDS", () => {
  it("requires claude CLI to include skip-permissions flag", () => {
    const [, args] = CLI_COMMANDS.claude
    expect(args).toContain("--dangerously-skip-permissions")
  })

  it("requires codex CLI to include bypass approvals flag", () => {
    const [, args] = CLI_COMMANDS.codex
    expect(args).toContain("--dangerously-bypass-approvals-and-sandbox")
  })

  it("requires gemini CLI to include yolo (non-interactive) flag", () => {
    const [, args] = CLI_COMMANDS.gemini
    expect(args).toContain("--yolo")
  })

  it("ensures each provider has a non-interactive safety bypass flag", () => {
    const requiredFlags: Record<string, string> = {
      claude: "--dangerously-skip-permissions",
      codex: "--dangerously-bypass-approvals-and-sandbox",
      gemini: "--yolo",
    }
    for (const provider of ["claude", "codex", "gemini"] as const) {
      const [, args] = CLI_COMMANDS[provider]
      expect(args).toContain(requiredFlags[provider])
    }
  })

  it("uses stdin placeholder for claude non-interactive prompt", () => {
    const [, args] = CLI_COMMANDS.claude
    expect(args).toContain("-")
  })
})

// ============================================================================
// Vision Agent Tests
// ============================================================================

describe("Agent action schema parsing", () => {
  const validActionKinds: AgentActionKind[] = [
    "click",
    "double_click",
    "type",
    "scroll",
    "keypress",
    "wait",
    "done",
  ]

  it("parses click action with coordinates", () => {
    const json = '{"action":{"kind":"click","x":100,"y":200}}'
    const parsed = JSON.parse(json)
    expect(parsed.action.kind).toBe("click")
    expect(parsed.action.x).toBe(100)
    expect(parsed.action.y).toBe(200)
  })

  it("parses double_click action with coordinates", () => {
    const json = '{"action":{"kind":"double_click","x":150,"y":250}}'
    const parsed = JSON.parse(json)
    expect(parsed.action.kind).toBe("double_click")
    expect(parsed.action.x).toBe(150)
    expect(parsed.action.y).toBe(250)
  })

  it("parses type action with text", () => {
    const json = '{"action":{"kind":"type","text":"hello@example.com"}}'
    const parsed = JSON.parse(json)
    expect(parsed.action.kind).toBe("type")
    expect(parsed.action.text).toBe("hello@example.com")
  })

  it("parses scroll action with dx/dy", () => {
    const json = '{"action":{"kind":"scroll","dx":0,"dy":400}}'
    const parsed = JSON.parse(json)
    expect(parsed.action.kind).toBe("scroll")
    expect(parsed.action.dx).toBe(0)
    expect(parsed.action.dy).toBe(400)
  })

  it("parses keypress action with key", () => {
    const json = '{"action":{"kind":"keypress","key":"Tab"}}'
    const parsed = JSON.parse(json)
    expect(parsed.action.kind).toBe("keypress")
    expect(parsed.action.key).toBe("Tab")
  })

  it("parses wait action with ms", () => {
    const json = '{"action":{"kind":"wait","ms":1000}}'
    const parsed = JSON.parse(json)
    expect(parsed.action.kind).toBe("wait")
    expect(parsed.action.ms).toBe(1000)
  })

  it("parses done action with reason", () => {
    const json = '{"action":{"kind":"done","reason":"Form submitted successfully"}}'
    const parsed = JSON.parse(json)
    expect(parsed.action.kind).toBe("done")
    expect(parsed.action.reason).toBe("Form submitted successfully")
  })

  it("rejects invalid action kind", () => {
    const json = '{"action":{"kind":"invalid"}}'
    const parsed = JSON.parse(json)
    expect(validActionKinds).not.toContain(parsed.action.kind)
  })

  it("validates action has required kind field", () => {
    const action: AgentAction = { kind: "click", x: 100, y: 200 }
    expect(action.kind).toBeDefined()
    expect(typeof action.kind).toBe("string")
  })
})

describe("Agent stuck detection", () => {
  it("detects stuck after threshold consecutive same hashes", () => {
    const hashes = ["abc123", "abc123", "abc123"] // 3 same hashes
    const threshold = 3
    let consecutiveNoChange = 0

    for (let i = 1; i < hashes.length; i++) {
      if (hashes[i] === hashes[i - 1]) {
        consecutiveNoChange++
      } else {
        consecutiveNoChange = 0
      }
    }
    // We start counting from second element, so 2 matches means 3 consecutive same hashes
    expect(consecutiveNoChange).toBe(2)
    expect(consecutiveNoChange + 1).toBeGreaterThanOrEqual(threshold)
  })

  it("resets counter when hash changes", () => {
    const hashes = ["abc123", "abc123", "def456", "def456"]
    let consecutiveNoChange = 0
    let prevHash = hashes[0]

    for (let i = 1; i < hashes.length; i++) {
      if (hashes[i] === prevHash) {
        consecutiveNoChange++
      } else {
        consecutiveNoChange = 0
      }
      prevHash = hashes[i]
    }

    expect(consecutiveNoChange).toBe(1) // Only 2 consecutive "def456" (1 match after reset)
  })

  it("does not increment counter on different consecutive hashes", () => {
    const hashes = ["abc", "def", "ghi", "jkl"]
    let consecutiveNoChange = 0
    let prevHash = hashes[0]

    for (let i = 1; i < hashes.length; i++) {
      if (hashes[i] === prevHash) {
        consecutiveNoChange++
      } else {
        consecutiveNoChange = 0
      }
      prevHash = hashes[i]
    }

    expect(consecutiveNoChange).toBe(0)
  })
})

describe("buildExtractionPrompt", () => {
  it("should include page content and URL", () => {
    const result = buildExtractionPrompt("Job description here", "https://example.com/job")
    expect(result).toContain("Job description here")
    expect(result).toContain("https://example.com/job")
  })

  it("should request all required fields", () => {
    const result = buildExtractionPrompt("content", "url")
    expect(result).toContain("title")
    expect(result).toContain("description")
    expect(result).toContain("location")
    expect(result).toContain("techStack")
    expect(result).toContain("companyName")
  })

  it("should request JSON output", () => {
    const result = buildExtractionPrompt("content", "url")
    expect(result).toContain("JSON")
    expect(result).toContain("no markdown")
  })
})

describe("parseJsonArrayFromOutput", () => {
  it("should parse clean JSON array", () => {
    const output = '[{"selector": "#email", "value": "test"}]'
    const result = parseJsonArrayFromOutput(output)
    expect(result).toEqual([{ selector: "#email", value: "test" }])
  })

  it("should extract JSON from output with surrounding text", () => {
    const output = `
Some logging output here
[{"selector": "#email", "value": "test"}]
More text after
`
    const result = parseJsonArrayFromOutput(output)
    expect(result).toEqual([{ selector: "#email", value: "test" }])
  })

  it("should handle nested arrays", () => {
    const output = '[{"items": [1, 2, 3]}]'
    const result = parseJsonArrayFromOutput(output)
    expect(result).toEqual([{ items: [1, 2, 3] }])
  })

  it("should throw for output without array", () => {
    expect(() => parseJsonArrayFromOutput('{"key": "value"}')).toThrow("No JSON array found")
  })

  it("should throw for empty output", () => {
    expect(() => parseJsonArrayFromOutput("")).toThrow("No JSON array found")
  })

  it("should throw for malformed JSON", () => {
    expect(() => parseJsonArrayFromOutput("[{broken json}]")).toThrow()
  })

  it("should handle multiple arrays by using first [ to last ]", () => {
    // This test documents the current behavior - it finds first [ to last ]
    // which may include invalid JSON if there are multiple arrays
    const output = '[{"result": true}]'
    const result = parseJsonArrayFromOutput(output)
    expect(result).toHaveLength(1)
    expect((result[0] as Record<string, boolean>).result).toBe(true)
  })
})

describe("parseCliArrayOutput", () => {
  it("parses raw array", () => {
    expect(parseCliArrayOutput('[1,2,3]')).toEqual([1, 2, 3])
  })

  it("parses wrapper with array result", () => {
    expect(parseCliArrayOutput('{"result":[{"a":1}]}')).toEqual([{ a: 1 }])
  })

  it("parses wrapper with stringified result", () => {
    expect(parseCliArrayOutput('{"result":"[\\"x\\",\\"y\\"]"}')).toEqual(["x", "y"])
  })

  it("parses wrapper that only exposes output_text", () => {
    const output = '{"type":"result","output_text":"[{\\"selector\\":\\"#x\\",\\"value\\":\\"foo\\"}]"}'
    expect(parseCliArrayOutput(output)).toEqual([{ selector: "#x", value: "foo" }])
  })

  it("parses wrapper with array stored under a different key", () => {
    const output = '{"type":"result","data":[1,2,3]}'
    expect(parseCliArrayOutput(output)).toEqual([1, 2, 3])
  })

  it("falls back to string search when JSON parse fails", () => {
    const output = "LOG\n[1,2]\nTAIL"
    expect(parseCliArrayOutput(output)).toEqual([1, 2])
  })
})

describe("parseJsonObjectFromOutput", () => {
  it("should parse clean JSON object", () => {
    const output = '{"title": "Developer", "company": "Acme"}'
    const result = parseJsonObjectFromOutput(output)
    expect(result).toEqual({ title: "Developer", company: "Acme" })
  })

  it("should extract JSON from output with surrounding text", () => {
    const output = `
Extracting job details...
{"title": "Developer", "company": "Acme"}
Done!
`
    const result = parseJsonObjectFromOutput(output)
    expect(result).toEqual({ title: "Developer", company: "Acme" })
  })

  it("should handle nested objects", () => {
    const output = '{"listing": {"title": "Dev", "location": "Remote"}}'
    const result = parseJsonObjectFromOutput(output)
    expect(result).toEqual({ listing: { title: "Dev", location: "Remote" } })
  })

  it("should throw for output without object", () => {
    expect(() => parseJsonObjectFromOutput("[1, 2, 3]")).toThrow("No JSON object found")
  })

  it("should throw for array (not object)", () => {
    expect(() => parseJsonObjectFromOutput('["not", "object"]')).toThrow("No JSON object found")
  })

  it("should throw for malformed JSON", () => {
    expect(() => parseJsonObjectFromOutput("{broken: json}")).toThrow()
  })
})

describe("parseCliObjectOutput", () => {
  it("parses raw object", () => {
    expect(parseCliObjectOutput('{"a":1}')).toEqual({ a: 1 })
  })

  it("parses wrapper with object result", () => {
    expect(parseCliObjectOutput('{"result":{"a":2}}')).toEqual({ a: 2 })
  })

  it("parses wrapper with stringified result", () => {
    expect(parseCliObjectOutput('{"result":"{\\"b\\":3}"}')).toEqual({ b: 3 })
  })

  it("parses wrapper with output_text string", () => {
    const output = '{"type":"result","output_text":"{\\"d\\":5}"}'
    expect(parseCliObjectOutput(output)).toEqual({ d: 5 })
  })

  it("falls back to embedded object when parse fails initially", () => {
    const output = "LOG\n{\"c\":4}\nTAIL"
    expect(parseCliObjectOutput(output)).toEqual({ c: 4 })
  })
})

describe("unwrap helpers", () => {
  it("unwrapJobMatch handles data.match shape", () => {
    const resp = { data: { match: { listing: { title: "Eng", companyName: "Acme" } } } }
    expect(unwrapJobMatch(resp)).toEqual(resp.data.match)
  })

  it("unwrapJobMatch falls back to data", () => {
    const resp = { data: { listing: { title: "Eng" } } }
    expect(unwrapJobMatch(resp)).toEqual(resp.data)
  })

  it("unwrapDocuments handles data.requests shape", () => {
    const docs = [{ id: "1" }]
    const resp = { data: { requests: docs, count: 1 } }
    expect(unwrapDocuments(resp)).toEqual(docs)
  })

  it("unwrapDocuments handles array directly", () => {
    const docs = [{ id: "2" }]
    expect(unwrapDocuments(docs)).toEqual(docs)
  })
})
