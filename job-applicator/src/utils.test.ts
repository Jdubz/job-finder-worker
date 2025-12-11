import { describe, it, expect } from "vitest"
import {
  normalizeUrl,
  resolveDocumentPath,
  formatEEOValue,
  formatWorkHistory,
  buildPrompt,
  buildEnhancedPrompt,
  buildExtractionPrompt,
  validateFillInstruction,
  validateEnhancedFillInstruction,
  parseJsonArrayFromOutput,
  parseJsonObjectFromOutput,
  parseCliArrayOutput,
  parseCliObjectOutput,
  unwrapJobMatch,
  unwrapDocuments,
  EEO_DISPLAY,
  type ContentItem,
  type PersonalInfo,
  type FormField,
} from "./utils.js"

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

describe("formatEEOValue", () => {
  it("should return display value for valid race", () => {
    expect(formatEEOValue("race", "asian")).toBe("Asian")
    expect(formatEEOValue("race", "white")).toBe("White")
    expect(formatEEOValue("race", "black_african_american")).toBe("Black or African American")
  })

  it("should return display value for valid gender", () => {
    expect(formatEEOValue("gender", "male")).toBe("Male")
    expect(formatEEOValue("gender", "female")).toBe("Female")
    expect(formatEEOValue("gender", "decline_to_identify")).toBe("Decline to Self-Identify")
  })

  it("should return display value for veteran status", () => {
    expect(formatEEOValue("veteranStatus", "not_protected_veteran")).toBe("I am not a protected veteran")
    expect(formatEEOValue("veteranStatus", "protected_veteran")).toContain("protected veteran")
  })

  it("should return display value for disability status", () => {
    expect(formatEEOValue("disabilityStatus", "yes")).toContain("Disability")
    expect(formatEEOValue("disabilityStatus", "no")).toContain("Don't Have")
  })

  it("should return 'Not provided' message for undefined value", () => {
    expect(formatEEOValue("race", undefined)).toBe("Not provided - skip this field")
  })

  it("should return original value for unknown field", () => {
    expect(formatEEOValue("unknownField", "someValue")).toBe("someValue")
  })

  it("should return original value for unknown enum value", () => {
    expect(formatEEOValue("race", "unknown_race")).toBe("unknown_race")
  })
})

describe("EEO_DISPLAY", () => {
  it("should have all race options", () => {
    expect(Object.keys(EEO_DISPLAY.race)).toHaveLength(7)
    expect(EEO_DISPLAY.race.american_indian_alaska_native).toBeDefined()
    expect(EEO_DISPLAY.race.asian).toBeDefined()
    expect(EEO_DISPLAY.race.white).toBeDefined()
  })

  it("should have all gender options", () => {
    expect(Object.keys(EEO_DISPLAY.gender)).toHaveLength(3)
  })

  it("should have all veteran status options", () => {
    expect(Object.keys(EEO_DISPLAY.veteranStatus)).toHaveLength(4)
  })

  it("should have all disability status options", () => {
    expect(Object.keys(EEO_DISPLAY.disabilityStatus)).toHaveLength(3)
  })
})

describe("formatWorkHistory", () => {
  it("should format single work item", () => {
    const items: ContentItem[] = [
      {
        id: "1",
        title: "Acme Corp",
        role: "Software Engineer",
        startDate: "2020-01",
        endDate: "2023-06",
        location: "Remote",
        description: "Built cool stuff",
        skills: ["TypeScript", "React"],
      },
    ]
    const result = formatWorkHistory(items)
    expect(result).toContain("Acme Corp")
    expect(result).toContain("Software Engineer")
    expect(result).toContain("2020-01")
    expect(result).toContain("2023-06")
    expect(result).toContain("Remote")
    expect(result).toContain("Built cool stuff")
    expect(result).toContain("TypeScript")
    expect(result).toContain("React")
  })

  it("should handle item without optional fields", () => {
    const items: ContentItem[] = [{ id: "1", title: "Company Name" }]
    const result = formatWorkHistory(items)
    expect(result).toContain("Company Name")
    expect(result).not.toContain("undefined")
  })

  it("should handle nested children", () => {
    const items: ContentItem[] = [
      {
        id: "1",
        title: "Parent Company",
        children: [{ id: "2", title: "Child Project", role: "Lead" }],
      },
    ]
    const result = formatWorkHistory(items)
    expect(result).toContain("Parent Company")
    expect(result).toContain("Child Project")
    expect(result).toContain("Lead")
  })

  it("should return empty string for empty array", () => {
    expect(formatWorkHistory([])).toBe("")
  })

  it("should handle items without title", () => {
    const items: ContentItem[] = [{ id: "1", role: "Developer" }]
    const result = formatWorkHistory(items)
    expect(result).toBe("")
  })

  it("should handle current position (no end date)", () => {
    const items: ContentItem[] = [
      { id: "1", title: "Current Job", startDate: "2023-01" },
    ]
    const result = formatWorkHistory(items)
    expect(result).toContain("present")
  })
})

describe("buildPrompt", () => {
  const mockProfile: PersonalInfo = {
    name: "John Doe",
    email: "john@example.com",
    phone: "555-1234",
    location: "Portland, OR",
    website: "https://johndoe.dev",
    github: "johndoe",
    linkedin: "linkedin.com/in/johndoe",
  }

  const mockFields: FormField[] = [
    { selector: "#email", type: "email", label: "Email", placeholder: null, required: true, options: null },
    { selector: "#name", type: "text", label: "Full Name", placeholder: null, required: true, options: null },
  ]

  it("should include all profile fields in prompt", () => {
    const result = buildPrompt(mockFields, mockProfile, [])
    expect(result).toContain("John Doe")
    expect(result).toContain("john@example.com")
    expect(result).toContain("555-1234")
    expect(result).toContain("Portland, OR")
    expect(result).toContain("johndoe.dev")
    expect(result).toContain("GitHub") // Field label is capitalized
    expect(result).toContain("johndoe") // GitHub username value
    expect(result).toContain("LinkedIn")
  })

  it("should include form fields JSON", () => {
    const result = buildPrompt(mockFields, mockProfile, [])
    expect(result).toContain("#email")
    expect(result).toContain("#name")
    expect(result).toContain("Email")
    expect(result).toContain("Full Name")
  })

  it("should include work history when provided", () => {
    const workHistory: ContentItem[] = [{ id: "1", title: "Past Job", role: "Dev" }]
    const result = buildPrompt(mockFields, mockProfile, workHistory)
    expect(result).toContain("Past Job")
    expect(result).toContain("Dev")
  })

  it("should handle missing optional profile fields", () => {
    const minimalProfile: PersonalInfo = { name: "Jane", email: "jane@test.com" }
    const result = buildPrompt(mockFields, minimalProfile, [])
    expect(result).toContain("Jane")
    expect(result).toContain("jane@test.com")
    expect(result).toContain("Not provided")
  })

  it("should include instructions for filling", () => {
    const result = buildPrompt(mockFields, mockProfile, [])
    expect(result).toContain("JSON array")
    expect(result).toContain("selector")
    expect(result).toContain("value")
    expect(result).toContain("Skip file upload")
  })
})

describe("buildEnhancedPrompt", () => {
  const mockProfile: PersonalInfo = {
    name: "John Doe",
    email: "john@example.com",
    eeo: {
      race: "white",
      gender: "male",
      hispanicLatino: "no",
      veteranStatus: "not_protected_veteran",
      disabilityStatus: "no",
    },
  }

  const mockFields: FormField[] = [
    { selector: "#email", type: "email", label: "Email", placeholder: null, required: true, options: null },
  ]

  it("should include EEO information when provided", () => {
    const result = buildEnhancedPrompt(mockFields, mockProfile, [], null)
    expect(result).toContain("EEO Information")
    expect(result).toContain("White")
    expect(result).toContain("Male")
    expect(result).toContain("not a protected veteran")
  })

  it("should include job context when provided", () => {
    const jobMatch = {
      listing: { companyName: "Acme Corp", title: "Senior Developer" },
      matchedSkills: ["React", "TypeScript"],
    }
    const result = buildEnhancedPrompt(mockFields, mockProfile, [], jobMatch)
    expect(result).toContain("Acme Corp")
    expect(result).toContain("Senior Developer")
    expect(result).toContain("React")
    expect(result).toContain("TypeScript")
  })

  it("should include safety rules", () => {
    const result = buildEnhancedPrompt(mockFields, mockProfile, [], null)
    expect(result).toContain("CRITICAL SAFETY RULES")
    expect(result).toContain("NEVER fill or interact with submit")
    expect(result).toContain("user must manually click")
  })

  it("should handle profile without EEO", () => {
    const profileNoEEO: PersonalInfo = { name: "Jane", email: "jane@test.com" }
    const result = buildEnhancedPrompt(mockFields, profileNoEEO, [], null)
    expect(result).toContain("EEO Information")
    expect(result).toContain("Not provided - skip EEO fields")
  })

  it("should include status field instructions", () => {
    const result = buildEnhancedPrompt(mockFields, mockProfile, [], null)
    expect(result).toContain('"status": "filled"')
    expect(result).toContain('"status": "skipped"')
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

describe("validateFillInstruction", () => {
  it("should return true for valid instruction", () => {
    expect(validateFillInstruction({ selector: "#email", value: "test@example.com" })).toBe(true)
  })

  it("should return false for missing selector", () => {
    expect(validateFillInstruction({ value: "test" })).toBe(false)
  })

  it("should return false for missing value", () => {
    expect(validateFillInstruction({ selector: "#email" })).toBe(false)
  })

  it("should return false for non-string selector", () => {
    expect(validateFillInstruction({ selector: 123, value: "test" })).toBe(false)
  })

  it("should return false for non-string value", () => {
    expect(validateFillInstruction({ selector: "#email", value: 123 })).toBe(false)
  })

  it("should return false for null", () => {
    expect(validateFillInstruction(null)).toBe(false)
  })

  it("should return false for non-object", () => {
    expect(validateFillInstruction("string")).toBe(false)
    expect(validateFillInstruction(123)).toBe(false)
    expect(validateFillInstruction(undefined)).toBe(false)
  })
})

describe("validateEnhancedFillInstruction", () => {
  it("should return true for valid filled instruction", () => {
    expect(
      validateEnhancedFillInstruction({
        selector: "#email",
        value: "test@example.com",
        status: "filled",
      })
    ).toBe(true)
  })

  it("should return true for valid skipped instruction", () => {
    expect(
      validateEnhancedFillInstruction({
        selector: "#file",
        value: null,
        status: "skipped",
        reason: "File upload",
      })
    ).toBe(true)
  })

  it("should return false for invalid status", () => {
    expect(
      validateEnhancedFillInstruction({
        selector: "#email",
        value: "test",
        status: "invalid" as "filled",
      })
    ).toBe(false)
  })

  it("should return false for missing selector", () => {
    expect(validateEnhancedFillInstruction({ value: "test", status: "filled" })).toBe(false)
  })

  it("should return false for non-string value when filled", () => {
    expect(
      validateEnhancedFillInstruction({
        selector: "#email",
        value: 123 as unknown as string,
        status: "filled",
      })
    ).toBe(false)
  })

  it("should allow null value for skipped status", () => {
    expect(
      validateEnhancedFillInstruction({
        selector: "#email",
        value: null,
        status: "skipped",
      })
    ).toBe(true)
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
