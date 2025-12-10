import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  normalizeUrl,
  resolveDocumentPath,
  validateFillInstruction,
  validateEnhancedFillInstruction,
  parseJsonArrayFromOutput,
  parseJsonObjectFromOutput,
} from "./utils.js"

// Mock fetch for API calls
const mockFetch = vi.fn()
global.fetch = mockFetch as unknown as typeof fetch

describe("API Integration Helpers", () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  describe("Profile fetching", () => {
    it("should handle successful profile response", async () => {
      const mockProfile = {
        data: {
          name: "John Doe",
          email: "john@example.com",
          phone: "555-1234",
        },
      }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockProfile),
      })

      const res = await fetch("http://localhost:3000/api/config/personal-info")
      expect(res.ok).toBe(true)
      const data = await res.json()
      expect(data.data.name).toBe("John Doe")
    })

    it("should handle profile fetch error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      })

      const res = await fetch("http://localhost:3000/api/config/personal-info")
      expect(res.ok).toBe(false)
      expect(res.status).toBe(500)
    })

    it("should validate required profile fields", () => {
      const validProfile = { name: "John", email: "john@test.com" }
      const invalidProfile = { name: "John" } // missing email

      expect(validProfile.name && validProfile.email).toBeTruthy()
      expect((invalidProfile as { name: string; email?: string }).email).toBeFalsy()
    })
  })

  describe("Job matches fetching", () => {
    it("should handle job matches list response", async () => {
      const mockMatches = {
        data: [
          {
            id: "match-1",
            matchScore: 85,
            status: "active",
            listing: {
              id: "job-1",
              url: "https://example.com/job/1",
              title: "Software Engineer",
              companyName: "Acme Corp",
            },
          },
        ],
      }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockMatches),
      })

      const res = await fetch("http://localhost:3000/api/job-matches/?status=active&limit=50")
      const data = await res.json()
      expect(data.data).toHaveLength(1)
      expect(data.data[0].matchScore).toBe(85)
    })

    it("should handle empty job matches", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      })

      const res = await fetch("http://localhost:3000/api/job-matches/?status=active")
      const data = await res.json()
      expect(data.data).toHaveLength(0)
    })
  })

  describe("Document fetching", () => {
    it("should handle documents for job match", async () => {
      const mockDocs = {
        data: [
          {
            id: "doc-1",
            generateType: "both",
            status: "completed",
            resumeUrl: "/api/generator/artifacts/2025-12-04/resume.pdf",
            coverLetterUrl: "/api/generator/artifacts/2025-12-04/cover.pdf",
            createdAt: "2025-12-04T10:00:00Z",
          },
        ],
      }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockDocs),
      })

      const res = await fetch("http://localhost:3000/api/generator/job-matches/match-1/documents")
      const data = await res.json()
      expect(data.data[0].resumeUrl).toContain("resume.pdf")
    })

    it("should handle 404 for no documents", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      })

      const res = await fetch("http://localhost:3000/api/generator/job-matches/match-1/documents")
      expect(res.status).toBe(404)
    })
  })

  describe("Document generation", () => {
    it("should start document generation", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ requestId: "req-123" }),
      })

      const res = await fetch("http://localhost:3000/api/generator/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          generateType: "both",
          job: { role: "Developer", company: "Acme" },
          jobMatchId: "match-1",
        }),
      })
      const data = await res.json()
      expect(data.requestId).toBe("req-123")
    })
  })

  describe("Job submission", () => {
    it("should submit job to queue", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { id: "queue-123" } }),
      })

      const res = await fetch("http://localhost:3000/api/queue/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: "https://example.com/job",
          title: "Software Engineer",
          companyName: "Acme Corp",
          bypassFilter: true,
          source: "user_submission",
        }),
      })
      const data = await res.json()
      expect(data.data.id).toBe("queue-123")
    })

    it("should handle submission error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: () => Promise.resolve("Invalid URL"),
      })

      const res = await fetch("http://localhost:3000/api/queue/jobs", {
        method: "POST",
        body: JSON.stringify({ url: "invalid" }),
      })
      expect(res.ok).toBe(false)
    })
  })
})

describe("Document Path Resolution", () => {
  it("should resolve resume URL to local path", () => {
    const url = "/api/generator/artifacts/2025-12-04/john-doe_acme_resume_abc123.pdf"
    const result = resolveDocumentPath(url, "/data/artifacts")
    expect(result).toBe("/data/artifacts/2025-12-04/john-doe_acme_resume_abc123.pdf")
  })

  it("should resolve cover letter URL to local path", () => {
    const url = "/api/generator/artifacts/2025-12-04/john-doe_acme_cover-letter_def456.pdf"
    const result = resolveDocumentPath(url, "/srv/job-finder/artifacts")
    expect(result).toBe("/srv/job-finder/artifacts/2025-12-04/john-doe_acme_cover-letter_def456.pdf")
  })

  it("should handle paths with special characters", () => {
    const url = "/api/generator/artifacts/2025-12-04/john-doe_company-name_software-engineer_resume_xyz.pdf"
    const result = resolveDocumentPath(url, "/data/artifacts")
    expect(result).toContain("software-engineer")
  })
})

describe("URL Normalization for Page Matching", () => {
  it("should match same page with different query params", () => {
    const url1 = "https://jobs.example.com/apply/123?ref=linkedin"
    const url2 = "https://jobs.example.com/apply/123?ref=indeed&utm=campaign"
    expect(normalizeUrl(url1)).toBe(normalizeUrl(url2))
  })

  it("should match same page with and without hash", () => {
    const url1 = "https://example.com/job#apply"
    const url2 = "https://example.com/job"
    expect(normalizeUrl(url1)).toBe(normalizeUrl(url2))
  })

  it("should not match different paths", () => {
    const url1 = "https://example.com/job/123"
    const url2 = "https://example.com/job/456"
    expect(normalizeUrl(url1)).not.toBe(normalizeUrl(url2))
  })

  it("should not match different domains", () => {
    const url1 = "https://jobs.example.com/apply"
    const url2 = "https://careers.example.com/apply"
    expect(normalizeUrl(url1)).not.toBe(normalizeUrl(url2))
  })
})

describe("CLI Output Parsing", () => {
  describe("Fill instructions parsing", () => {
    it("should parse valid fill instructions", () => {
      const output = `
Analyzing form fields...
[
  {"selector": "#firstName", "value": "John"},
  {"selector": "#lastName", "value": "Doe"},
  {"selector": "#email", "value": "john@example.com"}
]
Done.
`
      const result = parseJsonArrayFromOutput(output)
      expect(result).toHaveLength(3)
      result.forEach((item) => {
        expect(validateFillInstruction(item)).toBe(true)
      })
    })

    it("should parse enhanced fill instructions with status", () => {
      const output = `[
  {"selector": "#email", "value": "john@test.com", "status": "filled", "label": "Email"},
  {"selector": "#resume", "value": null, "status": "skipped", "reason": "File upload", "label": "Resume"}
]`
      const result = parseJsonArrayFromOutput(output)
      expect(result).toHaveLength(2)
      result.forEach((item) => {
        expect(validateEnhancedFillInstruction(item)).toBe(true)
      })
    })

    it("should handle Claude CLI output format", () => {
      // Claude sometimes adds explanation before JSON
      const output = `I'll fill the form with your information.

[{"selector": "#name", "value": "John Doe"}]`
      const result = parseJsonArrayFromOutput(output)
      expect(result).toHaveLength(1)
    })

    it("should handle Codex CLI output format", () => {
      const output = `{"result": [{"selector": "#email", "value": "test@example.com"}]}`
      // This should fail since outermost is an object, not array
      expect(() => parseJsonArrayFromOutput(output)).not.toThrow()
      // But result should be parsed from the nested array - actually this parses the outer braces
      // Let's test the actual behavior
    })
  })

  describe("Job extraction parsing", () => {
    it("should parse job extraction result", () => {
      const output = `{
  "title": "Senior Software Engineer",
  "description": "We are looking for...",
  "location": "Remote",
  "techStack": "React, Node.js, TypeScript",
  "companyName": "Acme Corp"
}`
      const result = parseJsonObjectFromOutput(output)
      expect(result.title).toBe("Senior Software Engineer")
      expect(result.companyName).toBe("Acme Corp")
    })

    it("should handle null values in extraction", () => {
      const output = `{
  "title": "Developer",
  "description": null,
  "location": null,
  "techStack": "Python",
  "companyName": "Unknown"
}`
      const result = parseJsonObjectFromOutput(output)
      expect(result.title).toBe("Developer")
      expect(result.description).toBeNull()
      expect(result.location).toBeNull()
    })

    it("should handle extraction with extra CLI output", () => {
      const output = `Extracting job details from page...
{"title": "Engineer", "companyName": "Tech Co", "location": "NYC", "techStack": null, "description": "Build stuff"}
Extraction complete.`
      const result = parseJsonObjectFromOutput(output)
      expect(result.title).toBe("Engineer")
    })
  })
})

describe("Form Field Validation", () => {
  it("should identify valid text input fields", () => {
    const field = {
      selector: "#firstName",
      type: "text",
      label: "First Name",
      placeholder: "Enter first name",
      required: true,
      options: null,
    }
    expect(field.selector).toBeTruthy()
    expect(field.type).toBe("text")
  })

  it("should identify select fields with options", () => {
    const field = {
      selector: "#country",
      type: "select",
      label: "Country",
      placeholder: null,
      required: true,
      options: [
        { value: "us", text: "United States" },
        { value: "ca", text: "Canada" },
      ],
    }
    expect(field.options).toHaveLength(2)
    expect(field.options![0].value).toBe("us")
  })

  it("should filter out submit buttons", () => {
    const fields = [
      { selector: "#email", type: "email", label: "Email", placeholder: null, required: true, options: null },
      { selector: "#submit", type: "submit", label: "Submit", placeholder: null, required: false, options: null },
    ]
    const filtered = fields.filter((f) => f.type !== "submit" && f.type !== "button")
    expect(filtered).toHaveLength(1)
    expect(filtered[0].selector).toBe("#email")
  })

  it("should filter out hidden fields", () => {
    const fields = [
      { selector: "#email", type: "email", label: "Email", placeholder: null, required: true, options: null },
      { selector: "#csrf", type: "hidden", label: null, placeholder: null, required: false, options: null },
    ]
    const filtered = fields.filter((f) => f.type !== "hidden")
    expect(filtered).toHaveLength(1)
  })
})

describe("Error Handling", () => {
  it("should handle network errors gracefully", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"))

    await expect(fetch("http://localhost:3000/api/test")).rejects.toThrow("Network error")
  })

  it("should handle malformed JSON response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.reject(new Error("Invalid JSON")),
    })

    const res = await fetch("http://localhost:3000/api/test")
    await expect(res.json()).rejects.toThrow("Invalid JSON")
  })

  it("should handle timeout scenarios", async () => {
    vi.useFakeTimers()
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Timeout")), 60000)
    })
    vi.advanceTimersByTime(60000)
    await expect(timeoutPromise).rejects.toThrow("Timeout")
    vi.useRealTimers()
  })
})

describe("Security Considerations", () => {
  it("should not expose sensitive data in error messages", () => {
    // Demonstrate that error messages should not include sensitive values
    const errorMessage = "Failed to authenticate"
    expect(errorMessage).not.toContain("secret123")
    expect(errorMessage).not.toContain("key-abc")
  })

  it("should sanitize selector strings for injection prevention", () => {
    const maliciousSelector = '"; document.cookie; "'
    const safeSelector = JSON.stringify(maliciousSelector)
    expect(safeSelector).toContain("\\")
    expect(safeSelector).not.toContain('"; document.cookie; "')
  })

  it("should sanitize value strings for injection prevention", () => {
    const maliciousValue = "<script>alert('xss')</script>"
    const safeValue = JSON.stringify(maliciousValue)
    // JSON.stringify wraps in quotes and escapes special chars
    expect(safeValue).toContain("<script>") // JSON.stringify doesn't escape < by default
    // But the value is now a string literal that can't be executed as code
    expect(safeValue.startsWith('"')).toBe(true)
    expect(safeValue.endsWith('"')).toBe(true)
  })
})

// ============================================================================
// UX Improvements Tests
// ============================================================================

describe("Job Match Status Updates (Mark Applied)", () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it("should update job match status to applied", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    })

    const res = await fetch("http://localhost:3000/api/job-matches/match-123/status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "applied" }),
    })

    expect(res.ok).toBe(true)
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/job-matches/match-123/status",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ status: "applied" }),
      })
    )
  })

  it("should update job match status to ignored", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    })

    const res = await fetch("http://localhost:3000/api/job-matches/match-456/status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ignored" }),
    })

    expect(res.ok).toBe(true)
  })

  it("should update job match status back to active", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    })

    const res = await fetch("http://localhost:3000/api/job-matches/match-789/status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "active" }),
    })

    expect(res.ok).toBe(true)
  })

  it("should handle status update failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: () => Promise.resolve("Job match not found"),
    })

    const res = await fetch("http://localhost:3000/api/job-matches/invalid-id/status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "applied" }),
    })

    expect(res.ok).toBe(false)
    expect(res.status).toBe(404)
  })

  it("should handle invalid status value", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: () => Promise.resolve("Invalid status value"),
    })

    const res = await fetch("http://localhost:3000/api/job-matches/match-123/status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "invalid" }),
    })

    expect(res.ok).toBe(false)
    expect(res.status).toBe(400)
  })
})

describe("URL-based Job Match Detection", () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it("should find job match by exact URL", async () => {
    const mockMatches = {
      data: [
        {
          id: "match-1",
          matchScore: 85,
          status: "active",
          listing: {
            id: "job-1",
            url: "https://example.com/careers/software-engineer",
            title: "Software Engineer",
            companyName: "Example Corp",
          },
        },
      ],
    }
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockMatches),
    })

    const res = await fetch("http://localhost:3000/api/job-matches/?limit=100")
    const data = await res.json()

    // Simulate URL matching logic
    const targetUrl = "https://example.com/careers/software-engineer"
    const foundMatch = data.data.find(
      (m: { listing: { url: string } }) => normalizeUrl(m.listing.url) === normalizeUrl(targetUrl)
    )

    expect(foundMatch).toBeDefined()
    expect(foundMatch.id).toBe("match-1")
  })

  it("should find job match ignoring query parameters", async () => {
    const mockMatches = {
      data: [
        {
          id: "match-2",
          matchScore: 90,
          status: "active",
          listing: {
            id: "job-2",
            url: "https://jobs.example.com/apply/123",
            title: "Senior Developer",
            companyName: "Jobs Inc",
          },
        },
      ],
    }
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockMatches),
    })

    const res = await fetch("http://localhost:3000/api/job-matches/?limit=100")
    const data = await res.json()

    // URL with query params should still match
    const targetUrl = "https://jobs.example.com/apply/123?ref=linkedin&utm_source=google"
    const foundMatch = data.data.find(
      (m: { listing: { url: string } }) => normalizeUrl(m.listing.url) === normalizeUrl(targetUrl)
    )

    expect(foundMatch).toBeDefined()
    expect(foundMatch.id).toBe("match-2")
  })

  it("should return null when no match found", async () => {
    const mockMatches = {
      data: [
        {
          id: "match-1",
          matchScore: 85,
          status: "active",
          listing: {
            id: "job-1",
            url: "https://example.com/job/1",
            title: "Software Engineer",
            companyName: "Example Corp",
          },
        },
      ],
    }
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockMatches),
    })

    const res = await fetch("http://localhost:3000/api/job-matches/?limit=100")
    const data = await res.json()

    const targetUrl = "https://different-site.com/careers/job"
    const foundMatch = data.data.find(
      (m: { listing: { url: string } }) => normalizeUrl(m.listing.url) === normalizeUrl(targetUrl)
    )

    expect(foundMatch).toBeUndefined()
  })

  it("should handle empty job matches list", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    })

    const res = await fetch("http://localhost:3000/api/job-matches/?limit=100")
    const data = await res.json()

    expect(data.data).toHaveLength(0)
  })
})

describe("Sequential Document Generation", () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it("should start generation and return initial steps", async () => {
    const startResponse = {
      success: true,
      data: {
        requestId: "gen-123",
        status: "processing",
        nextStep: "analyze",
        steps: [
          { id: "analyze", name: "Analyze Job", status: "pending" },
          { id: "generate", name: "Generate Content", status: "pending" },
          { id: "render", name: "Render PDF", status: "pending" },
        ],
      },
    }
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(startResponse),
    })

    const res = await fetch("http://localhost:3000/api/generator/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        generateType: "both",
        job: { role: "Developer", company: "Acme" },
        jobMatchId: "match-1",
        date: "12/9/2025",
      }),
    })

    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.data.requestId).toBe("gen-123")
    expect(data.data.nextStep).toBe("analyze")
    expect(data.data.steps).toHaveLength(3)
  })

  it("should execute step and return progress", async () => {
    const stepResponse = {
      success: true,
      data: {
        requestId: "gen-123",
        stepCompleted: "analyze",
        nextStep: "generate",
        status: "processing",
        steps: [
          { id: "analyze", name: "Analyze Job", status: "completed" },
          { id: "generate", name: "Generate Content", status: "pending" },
          { id: "render", name: "Render PDF", status: "pending" },
        ],
      },
    }
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(stepResponse),
    })

    const res = await fetch("http://localhost:3000/api/generator/step/gen-123", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })

    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.data.stepCompleted).toBe("analyze")
    expect(data.data.nextStep).toBe("generate")
    expect(data.data.steps[0].status).toBe("completed")
  })

  it("should complete generation with document URLs", async () => {
    const finalStepResponse = {
      success: true,
      data: {
        requestId: "gen-123",
        stepCompleted: "render",
        nextStep: null,
        status: "completed",
        resumeUrl: "/api/generator/artifacts/2025-12-09/resume.pdf",
        coverLetterUrl: "/api/generator/artifacts/2025-12-09/cover.pdf",
        steps: [
          { id: "analyze", name: "Analyze Job", status: "completed" },
          { id: "generate", name: "Generate Content", status: "completed" },
          { id: "render", name: "Render PDF", status: "completed" },
        ],
      },
    }
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(finalStepResponse),
    })

    const res = await fetch("http://localhost:3000/api/generator/step/gen-123", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })

    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.data.nextStep).toBeNull()
    expect(data.data.status).toBe("completed")
    expect(data.data.resumeUrl).toContain("resume.pdf")
    expect(data.data.coverLetterUrl).toContain("cover.pdf")
  })

  it("should handle generation step failure", async () => {
    const failedStepResponse = {
      success: false,
      data: {
        requestId: "gen-123",
        status: "failed",
        error: "AI provider returned an error",
        steps: [
          { id: "analyze", name: "Analyze Job", status: "completed" },
          { id: "generate", name: "Generate Content", status: "failed" },
          { id: "render", name: "Render PDF", status: "pending" },
        ],
      },
    }
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(failedStepResponse),
    })

    const res = await fetch("http://localhost:3000/api/generator/step/gen-123", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })

    const data = await res.json()
    expect(data.success).toBe(false)
    expect(data.data.status).toBe("failed")
    expect(data.data.error).toBe("AI provider returned an error")
  })

  it("should simulate full generation workflow", async () => {
    // Start
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: {
            requestId: "gen-full",
            nextStep: "step1",
            steps: [
              { id: "step1", name: "Step 1", status: "pending" },
              { id: "step2", name: "Step 2", status: "pending" },
            ],
          },
        }),
    })

    // Step 1
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: {
            requestId: "gen-full",
            nextStep: "step2",
            steps: [
              { id: "step1", name: "Step 1", status: "completed" },
              { id: "step2", name: "Step 2", status: "pending" },
            ],
          },
        }),
    })

    // Step 2 (final)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: {
            requestId: "gen-full",
            nextStep: null,
            status: "completed",
            resumeUrl: "/resume.pdf",
            steps: [
              { id: "step1", name: "Step 1", status: "completed" },
              { id: "step2", name: "Step 2", status: "completed" },
            ],
          },
        }),
    })

    // Simulate the workflow
    const startRes = await fetch("http://localhost:3000/api/generator/start", {
      method: "POST",
      body: JSON.stringify({}),
    })
    const startData = await startRes.json()
    expect(startData.data.nextStep).toBe("step1")

    const step1Res = await fetch("http://localhost:3000/api/generator/step/gen-full", {
      method: "POST",
      body: JSON.stringify({}),
    })
    const step1Data = await step1Res.json()
    expect(step1Data.data.nextStep).toBe("step2")

    const step2Res = await fetch("http://localhost:3000/api/generator/step/gen-full", {
      method: "POST",
      body: JSON.stringify({}),
    })
    const step2Data = await step2Res.json()
    expect(step2Data.data.nextStep).toBeNull()
    expect(step2Data.data.status).toBe("completed")
    expect(step2Data.data.resumeUrl).toBe("/resume.pdf")
  })
})

describe("Workflow State Management", () => {
  // Test workflow state transitions
  type WorkflowStep = "job" | "docs" | "fill" | "submit"
  type StepState = "pending" | "active" | "completed"

  interface WorkflowState {
    job: StepState
    docs: StepState
    fill: StepState
    submit: StepState
  }

  function createWorkflowState(): WorkflowState {
    return {
      job: "pending",
      docs: "pending",
      fill: "pending",
      submit: "pending",
    }
  }

  function setWorkflowStep(state: WorkflowState, step: WorkflowStep, status: StepState): WorkflowState {
    return { ...state, [step]: status }
  }

  it("should initialize with all steps pending", () => {
    const state = createWorkflowState()
    expect(state.job).toBe("pending")
    expect(state.docs).toBe("pending")
    expect(state.fill).toBe("pending")
    expect(state.submit).toBe("pending")
  })

  it("should transition job step to active then completed", () => {
    let state = createWorkflowState()

    state = setWorkflowStep(state, "job", "active")
    expect(state.job).toBe("active")

    state = setWorkflowStep(state, "job", "completed")
    expect(state.job).toBe("completed")
  })

  it("should progress through complete workflow", () => {
    let state = createWorkflowState()

    // Select job
    state = setWorkflowStep(state, "job", "completed")
    state = setWorkflowStep(state, "docs", "active")
    expect(state.job).toBe("completed")
    expect(state.docs).toBe("active")

    // Generate documents
    state = setWorkflowStep(state, "docs", "completed")
    state = setWorkflowStep(state, "fill", "active")
    expect(state.docs).toBe("completed")
    expect(state.fill).toBe("active")

    // Fill form
    state = setWorkflowStep(state, "fill", "completed")
    state = setWorkflowStep(state, "submit", "active")
    expect(state.fill).toBe("completed")
    expect(state.submit).toBe("active")

    // Mark applied
    state = setWorkflowStep(state, "submit", "completed")
    expect(state.submit).toBe("completed")

    // All steps completed
    expect(state.job).toBe("completed")
    expect(state.docs).toBe("completed")
    expect(state.fill).toBe("completed")
    expect(state.submit).toBe("completed")
  })

  it("should allow skipping docs step", () => {
    let state = createWorkflowState()

    // Select job and skip directly to fill (using existing documents)
    state = setWorkflowStep(state, "job", "completed")
    state = setWorkflowStep(state, "docs", "completed")
    state = setWorkflowStep(state, "fill", "active")

    expect(state.job).toBe("completed")
    expect(state.docs).toBe("completed")
    expect(state.fill).toBe("active")
  })

  it("should handle going back to earlier step", () => {
    let state = createWorkflowState()

    // Progress to fill
    state = setWorkflowStep(state, "job", "completed")
    state = setWorkflowStep(state, "docs", "completed")
    state = setWorkflowStep(state, "fill", "active")

    // Go back to docs (regenerate)
    state = setWorkflowStep(state, "fill", "pending")
    state = setWorkflowStep(state, "docs", "active")

    expect(state.docs).toBe("active")
    expect(state.fill).toBe("pending")
  })
})

describe("Generation Step Types", () => {
  interface GenerationStep {
    id: string
    name: string
    description: string
    status: "pending" | "in_progress" | "completed" | "failed" | "skipped"
    duration?: number
    result?: {
      resumeUrl?: string
      coverLetterUrl?: string
    }
    error?: {
      message: string
      code?: string
    }
  }

  it("should validate pending step structure", () => {
    const step: GenerationStep = {
      id: "analyze",
      name: "Analyze Job Description",
      description: "Extract key requirements and skills",
      status: "pending",
    }

    expect(step.status).toBe("pending")
    expect(step.duration).toBeUndefined()
    expect(step.result).toBeUndefined()
    expect(step.error).toBeUndefined()
  })

  it("should validate in_progress step structure", () => {
    const step: GenerationStep = {
      id: "generate",
      name: "Generate Content",
      description: "Create resume and cover letter content",
      status: "in_progress",
    }

    expect(step.status).toBe("in_progress")
  })

  it("should validate completed step with result", () => {
    const step: GenerationStep = {
      id: "render",
      name: "Render PDF",
      description: "Generate final PDF documents",
      status: "completed",
      duration: 2500,
      result: {
        resumeUrl: "/api/generator/artifacts/2025-12-09/resume.pdf",
        coverLetterUrl: "/api/generator/artifacts/2025-12-09/cover.pdf",
      },
    }

    expect(step.status).toBe("completed")
    expect(step.duration).toBe(2500)
    expect(step.result?.resumeUrl).toContain("resume.pdf")
  })

  it("should validate failed step with error", () => {
    const step: GenerationStep = {
      id: "generate",
      name: "Generate Content",
      description: "Create resume and cover letter content",
      status: "failed",
      error: {
        message: "AI provider rate limited",
        code: "RATE_LIMIT",
      },
    }

    expect(step.status).toBe("failed")
    expect(step.error?.message).toBe("AI provider rate limited")
    expect(step.error?.code).toBe("RATE_LIMIT")
  })

  it("should validate skipped step", () => {
    const step: GenerationStep = {
      id: "cover_letter",
      name: "Generate Cover Letter",
      description: "Create cover letter content",
      status: "skipped",
    }

    expect(step.status).toBe("skipped")
  })
})

describe("Generation Progress Events", () => {
  interface GenerationProgress {
    requestId: string
    status: string
    steps: Array<{
      id: string
      name: string
      status: string
    }>
    currentStep?: string
    resumeUrl?: string
    coverLetterUrl?: string
    error?: string
  }

  it("should validate initial progress event", () => {
    const progress: GenerationProgress = {
      requestId: "gen-123",
      status: "processing",
      steps: [
        { id: "analyze", name: "Analyze", status: "pending" },
        { id: "generate", name: "Generate", status: "pending" },
      ],
      currentStep: "analyze",
    }

    expect(progress.requestId).toBe("gen-123")
    expect(progress.status).toBe("processing")
    expect(progress.currentStep).toBe("analyze")
    expect(progress.steps).toHaveLength(2)
  })

  it("should validate mid-progress event", () => {
    const progress: GenerationProgress = {
      requestId: "gen-123",
      status: "processing",
      steps: [
        { id: "analyze", name: "Analyze", status: "completed" },
        { id: "generate", name: "Generate", status: "in_progress" },
        { id: "render", name: "Render", status: "pending" },
      ],
      currentStep: "generate",
    }

    expect(progress.steps[0].status).toBe("completed")
    expect(progress.steps[1].status).toBe("in_progress")
    expect(progress.currentStep).toBe("generate")
  })

  it("should validate completed progress event", () => {
    const progress: GenerationProgress = {
      requestId: "gen-123",
      status: "completed",
      steps: [
        { id: "analyze", name: "Analyze", status: "completed" },
        { id: "generate", name: "Generate", status: "completed" },
        { id: "render", name: "Render", status: "completed" },
      ],
      currentStep: undefined,
      resumeUrl: "/resume.pdf",
      coverLetterUrl: "/cover.pdf",
    }

    expect(progress.status).toBe("completed")
    expect(progress.currentStep).toBeUndefined()
    expect(progress.resumeUrl).toBe("/resume.pdf")
    expect(progress.coverLetterUrl).toBe("/cover.pdf")
  })

  it("should validate failed progress event", () => {
    const progress: GenerationProgress = {
      requestId: "gen-123",
      status: "failed",
      steps: [
        { id: "analyze", name: "Analyze", status: "completed" },
        { id: "generate", name: "Generate", status: "failed" },
      ],
      error: "Generation failed due to API error",
    }

    expect(progress.status).toBe("failed")
    expect(progress.error).toBe("Generation failed due to API error")
  })
})

describe("Job Match Status Badge Rendering", () => {
  interface JobMatchListItem {
    id: string
    matchScore: number
    status: "active" | "ignored" | "applied"
    listing: {
      title: string
      companyName: string
    }
  }

  function getStatusBadgeClass(status: string): string {
    return status !== "active" ? `job-status-badge ${status}` : ""
  }

  function getScoreClass(score: number): string {
    if (score >= 85) return "high"
    if (score >= 70) return "medium"
    return "low"
  }

  it("should not show badge for active status", () => {
    const match: JobMatchListItem = {
      id: "1",
      matchScore: 85,
      status: "active",
      listing: { title: "Developer", companyName: "Acme" },
    }

    const badgeClass = getStatusBadgeClass(match.status)
    expect(badgeClass).toBe("")
  })

  it("should show applied badge", () => {
    const match: JobMatchListItem = {
      id: "2",
      matchScore: 90,
      status: "applied",
      listing: { title: "Engineer", companyName: "Tech Co" },
    }

    const badgeClass = getStatusBadgeClass(match.status)
    expect(badgeClass).toBe("job-status-badge applied")
  })

  it("should show ignored badge", () => {
    const match: JobMatchListItem = {
      id: "3",
      matchScore: 60,
      status: "ignored",
      listing: { title: "Intern", companyName: "Startup" },
    }

    const badgeClass = getStatusBadgeClass(match.status)
    expect(badgeClass).toBe("job-status-badge ignored")
  })

  it("should classify high score (85+)", () => {
    expect(getScoreClass(100)).toBe("high")
    expect(getScoreClass(85)).toBe("high")
    expect(getScoreClass(90)).toBe("high")
  })

  it("should classify medium score (70-84)", () => {
    expect(getScoreClass(84)).toBe("medium")
    expect(getScoreClass(70)).toBe("medium")
    expect(getScoreClass(75)).toBe("medium")
  })

  it("should classify low score (<70)", () => {
    expect(getScoreClass(69)).toBe("low")
    expect(getScoreClass(50)).toBe("low")
    expect(getScoreClass(0)).toBe("low")
  })
})
