import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  normalizeUrl,
  parseJsonArrayFromOutput,
  parseJsonObjectFromOutput,
} from "./utils.js"
import type {
  ApiResponse,
  ApiErrorResponse,
  ApiSuccessResponse,
  JobMatchWithListing,
  ListJobMatchesResponse,
  JobListingRecord,
  TimestampLike,
  ResumeContent,
  CoverLetterContent,
  DraftContentResponse,
} from "@shared/types"
import {
  draftContentResponseSchema,
  submitReviewResponseSchema,
  resumeContentSchema,
  coverLetterContentSchema,
} from "@shared/types"

// Mock fetch for API calls
const mockFetch = vi.fn()
global.fetch = mockFetch as unknown as typeof fetch

/**
 * Helper to create a mock TimestampLike for tests
 */
function mockTimestamp(isoString = "2025-12-10T10:00:00Z"): TimestampLike {
  return new Date(isoString)
}

/**
 * Helper to create a properly typed API success response
 */
function createSuccessResponse<T>(data: T): ApiSuccessResponse<T> {
  return { success: true, data }
}

/**
 * Helper to create a properly typed API error response
 */
function createErrorResponse(code: string, message: string): ApiErrorResponse {
  return { success: false, error: { code, message } }
}

/**
 * Helper to create a minimal JobListingRecord for tests
 */
function createTestListing(overrides: Partial<JobListingRecord> & { url: string; title: string; companyName: string }): JobListingRecord {
  return {
    id: overrides.id ?? `listing-${Math.random().toString(36).slice(2)}`,
    url: overrides.url,
    title: overrides.title,
    companyName: overrides.companyName,
    description: overrides.description ?? "Test job description",
    sourceId: overrides.sourceId ?? "linkedin",
    status: overrides.status ?? "matched",
    createdAt: overrides.createdAt ?? mockTimestamp(),
    updatedAt: overrides.updatedAt ?? mockTimestamp(),
  }
}

/**
 * Helper to create a minimal JobMatchWithListing for tests
 */
function createTestJobMatch(overrides: { id: string; listing: { url: string; title: string; companyName: string }; matchScore?: number; status?: "active" | "ignored" | "applied" }): JobMatchWithListing {
  const listing = createTestListing(overrides.listing)
  return {
    id: overrides.id,
    jobListingId: listing.id,
    matchScore: overrides.matchScore ?? 85,
    status: overrides.status ?? "active",
    matchedSkills: [],
    missingSkills: [],
    matchReasons: [],
    keyStrengths: [],
    potentialConcerns: [],
    experienceMatch: 80,
    customizationRecommendations: [],
    analyzedAt: mockTimestamp(),
    createdAt: mockTimestamp(),
    updatedAt: mockTimestamp(),
    submittedBy: null,
    queueItemId: "queue-1",
    listing,
  }
}

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
      const mockResponse = createSuccessResponse<ListJobMatchesResponse>({
        matches: [
          createTestJobMatch({
            id: "match-1",
            matchScore: 85,
            listing: {
              url: "https://example.com/job/1",
              title: "Software Engineer",
              companyName: "Acme Corp",
            },
          }),
        ],
        count: 1,
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      })

      const res = await fetch("http://localhost:3000/api/job-matches/?status=active&limit=50")
      const data = await res.json() as ApiResponse<ListJobMatchesResponse>
      expect(data.success).toBe(true)
      if (data.success) {
        expect(data.data.matches).toHaveLength(1)
        expect(data.data.matches[0].matchScore).toBe(85)
      }
    })

    it("should handle empty job matches", async () => {
      const mockResponse = createSuccessResponse<ListJobMatchesResponse>({
        matches: [],
        count: 0,
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      })

      const res = await fetch("http://localhost:3000/api/job-matches/?status=active")
      const data = await res.json() as ApiResponse<ListJobMatchesResponse>
      expect(data.success).toBe(true)
      if (data.success) {
        expect(data.data.matches).toHaveLength(0)
      }
    })

    it("should handle 401 unauthorized error", async () => {
      const mockResponse = createErrorResponse("UNAUTHORIZED", "Authentication required")
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve(mockResponse),
      })

      const res = await fetch("http://localhost:3000/api/job-matches/?status=active")
      expect(res.ok).toBe(false)
      const data = await res.json() as ApiErrorResponse
      expect(data.success).toBe(false)
      expect(data.error.code).toBe("UNAUTHORIZED")
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

// Note: Document path resolution and URL normalization tests are in utils.test.ts

describe("CLI Output Parsing", () => {
  describe("JSON array parsing", () => {
    it("should parse valid JSON array from output", () => {
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
    })

    it("should handle Claude CLI output format", () => {
      // Claude sometimes adds explanation before JSON
      const output = `I'll fill the form with your information.

[{"selector": "#name", "value": "John Doe"}]`
      const result = parseJsonArrayFromOutput(output)
      expect(result).toHaveLength(1)
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
    const mockResponse = createSuccessResponse<ListJobMatchesResponse>({
      matches: [
        createTestJobMatch({
          id: "match-1",
          matchScore: 85,
          listing: {
            url: "https://example.com/careers/software-engineer",
            title: "Software Engineer",
            companyName: "Example Corp",
          },
        }),
      ],
      count: 1,
    })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    })

    const res = await fetch("http://localhost:3000/api/job-matches/?limit=100")
    const data = await res.json() as ApiResponse<ListJobMatchesResponse>

    expect(data.success).toBe(true)

    if (data.success) {
      // Simulate URL matching logic
      const targetUrl = "https://example.com/careers/software-engineer"
      const foundMatch = data.data.matches.find(
        (m) => normalizeUrl(m.listing.url) === normalizeUrl(targetUrl)
      )

      expect(foundMatch).toBeDefined()
      expect(foundMatch?.id).toBe("match-1")
    }
  })

  it("should find job match ignoring query parameters", async () => {
    const mockResponse = createSuccessResponse<ListJobMatchesResponse>({
      matches: [
        createTestJobMatch({
          id: "match-2",
          matchScore: 90,
          listing: {
            url: "https://jobs.example.com/apply/123",
            title: "Senior Developer",
            companyName: "Jobs Inc",
          },
        }),
      ],
      count: 1,
    })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    })

    const res = await fetch("http://localhost:3000/api/job-matches/?limit=100")
    const data = await res.json() as ApiResponse<ListJobMatchesResponse>

    expect(data.success).toBe(true)

    if (data.success) {
      // URL with query params should still match
      const targetUrl = "https://jobs.example.com/apply/123?ref=linkedin&utm_source=google"
      const foundMatch = data.data.matches.find(
        (m) => normalizeUrl(m.listing.url) === normalizeUrl(targetUrl)
      )

      expect(foundMatch).toBeDefined()
      expect(foundMatch?.id).toBe("match-2")
    }
  })

  it("should return undefined when no match found", async () => {
    const mockResponse = createSuccessResponse<ListJobMatchesResponse>({
      matches: [
        createTestJobMatch({
          id: "match-1",
          matchScore: 85,
          listing: {
            url: "https://example.com/job/1",
            title: "Software Engineer",
            companyName: "Example Corp",
          },
        }),
      ],
      count: 1,
    })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    })

    const res = await fetch("http://localhost:3000/api/job-matches/?limit=100")
    const data = await res.json() as ApiResponse<ListJobMatchesResponse>

    expect(data.success).toBe(true)

    if (data.success) {
      const targetUrl = "https://different-site.com/careers/job"
      const foundMatch = data.data.matches.find(
        (m) => normalizeUrl(m.listing.url) === normalizeUrl(targetUrl)
      )

      expect(foundMatch).toBeUndefined()
    }
  })

  it("should handle empty job matches list", async () => {
    const mockResponse = createSuccessResponse<ListJobMatchesResponse>({
      matches: [],
      count: 0,
    })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    })

    const res = await fetch("http://localhost:3000/api/job-matches/?limit=100")
    const data = await res.json() as ApiResponse<ListJobMatchesResponse>

    expect(data.success).toBe(true)
    if (data.success) {
      expect(data.data.matches).toHaveLength(0)
    }
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
  // Uses JobMatchWithListing from @shared/types - status field is "active" | "ignored" | "applied"

  function getStatusBadgeClass(status: JobMatchWithListing["status"]): string {
    return status !== "active" ? `job-status-badge ${status}` : ""
  }

  function getScoreClass(score: number): string {
    if (score >= 85) return "high"
    if (score >= 70) return "medium"
    return "low"
  }

  it("should not show badge for active status", () => {
    const status: JobMatchWithListing["status"] = "active"
    const badgeClass = getStatusBadgeClass(status)
    expect(badgeClass).toBe("")
  })

  it("should show applied badge", () => {
    const status: JobMatchWithListing["status"] = "applied"
    const badgeClass = getStatusBadgeClass(status)
    expect(badgeClass).toBe("job-status-badge applied")
  })

  it("should show ignored badge", () => {
    const status: JobMatchWithListing["status"] = "ignored"
    const badgeClass = getStatusBadgeClass(status)
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

// ============================================================================
// Document Review Workflow Tests
// ============================================================================

describe("Document Review Workflow", () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  const mockResumeContent: ResumeContent = {
    personalInfo: {
      name: "John Doe",
      title: "Software Engineer",
      summary: "Experienced developer",
      contact: {
        email: "john@example.com",
        location: "San Francisco, CA",
      },
    },
    professionalSummary: "10+ years of experience in full-stack development.",
    experience: [
      {
        company: "Acme Corp",
        role: "Senior Engineer",
        startDate: "2020-01",
        endDate: null,
        highlights: ["Led team of 5", "Improved performance by 40%"],
      },
    ],
    skills: [{ category: "Languages", items: ["TypeScript", "Python"] }],
    education: [{ institution: "MIT", degree: "BS", field: "Computer Science" }],
  }

  const mockCoverLetterContent: CoverLetterContent = {
    greeting: "Dear Hiring Manager,",
    openingParagraph: "I am excited to apply for the Software Engineer position.",
    bodyParagraphs: [
      "I have extensive experience building scalable applications.",
      "My background aligns well with your needs.",
    ],
    closingParagraph: "I look forward to discussing this opportunity.",
    signature: "Best regards,\nJohn Doe",
  }

  describe("Draft Content Fetching", () => {
    it("should fetch resume draft content and validate against schema", async () => {
      const mockDraftResponse = {
        success: true,
        data: {
          requestId: "req-123",
          documentType: "resume",
          content: mockResumeContent,
          status: "awaiting_review",
        } satisfies DraftContentResponse,
      }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockDraftResponse),
      })

      const res = await fetch("http://localhost:3000/api/generator/requests/req-123/draft")
      const data = await res.json()

      expect(data.success).toBe(true)

      // Validate response matches shared schema
      const parsed = draftContentResponseSchema.safeParse(data.data)
      expect(parsed.success).toBe(true)
      if (parsed.success) {
        expect(parsed.data.documentType).toBe("resume")
        expect(parsed.data.status).toBe("awaiting_review")
      }
    })

    it("should fetch cover letter draft content and validate against schema", async () => {
      const mockDraftResponse = {
        success: true,
        data: {
          requestId: "req-456",
          documentType: "coverLetter",
          content: mockCoverLetterContent,
          status: "awaiting_review",
        } satisfies DraftContentResponse,
      }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockDraftResponse),
      })

      const res = await fetch("http://localhost:3000/api/generator/requests/req-456/draft")
      const data = await res.json()

      expect(data.success).toBe(true)

      const parsed = draftContentResponseSchema.safeParse(data.data)
      expect(parsed.success).toBe(true)
      if (parsed.success) {
        expect(parsed.data.documentType).toBe("coverLetter")
      }
    })

    it("should handle 404 when no draft is available", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ success: false, error: { code: "NOT_FOUND", message: "No draft content" } }),
      })

      const res = await fetch("http://localhost:3000/api/generator/requests/non-existent/draft")
      expect(res.ok).toBe(false)
      expect(res.status).toBe(404)
    })

    it("should validate resume content structure", () => {
      const parsed = resumeContentSchema.safeParse(mockResumeContent)
      expect(parsed.success).toBe(true)
      if (parsed.success) {
        expect(parsed.data.personalInfo.name).toBe("John Doe")
        expect(parsed.data.experience).toHaveLength(1)
      }
    })

    it("should validate cover letter content structure", () => {
      const parsed = coverLetterContentSchema.safeParse(mockCoverLetterContent)
      expect(parsed.success).toBe(true)
      if (parsed.success) {
        expect(parsed.data.greeting).toBe("Dear Hiring Manager,")
        expect(parsed.data.bodyParagraphs).toHaveLength(2)
      }
    })
  })

  describe("Review Submission", () => {
    it("should submit edited resume content", async () => {
      const mockSubmitResponse = {
        success: true,
        data: {
          nextStep: "render-pdf",
          status: "processing",
          steps: [
            { id: "review-resume", name: "Review Resume", description: "Review content", status: "completed" },
            { id: "render-pdf", name: "Render PDF", description: "Create PDF", status: "pending" },
          ],
          resumeUrl: null,
          coverLetterUrl: null,
        },
      }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSubmitResponse),
      })

      const editedContent: ResumeContent = {
        ...mockResumeContent,
        professionalSummary: "Updated summary by user during review",
      }

      const res = await fetch("http://localhost:3000/api/generator/requests/req-123/submit-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentType: "resume",
          content: editedContent,
        }),
      })

      const data = await res.json()
      expect(data.success).toBe(true)

      // Validate response matches shared schema
      const parsed = submitReviewResponseSchema.safeParse(data.data)
      expect(parsed.success).toBe(true)
      if (parsed.success) {
        expect(parsed.data.status).toBe("processing")
        expect(parsed.data.nextStep).toBe("render-pdf")
      }
    })

    it("should submit edited cover letter content", async () => {
      const mockSubmitResponse = {
        success: true,
        data: {
          nextStep: "render-pdf",
          status: "processing",
          steps: [],
          resumeUrl: null,
          coverLetterUrl: null,
        },
      }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSubmitResponse),
      })

      const editedContent: CoverLetterContent = {
        ...mockCoverLetterContent,
        openingParagraph: "Edited opening paragraph by user",
      }

      const res = await fetch("http://localhost:3000/api/generator/requests/req-456/submit-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentType: "coverLetter",
          content: editedContent,
        }),
      })

      const data = await res.json()
      expect(data.success).toBe(true)
    })

    it("should handle 400 for invalid content", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({
            success: false,
            error: { code: "INVALID_REQUEST", message: "Validation error" },
          }),
      })

      const res = await fetch("http://localhost:3000/api/generator/requests/req-123/submit-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentType: "resume",
          content: { invalid: "content" },
        }),
      })

      expect(res.ok).toBe(false)
      expect(res.status).toBe(400)
    })

    it("should handle 404 when request not awaiting review", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () =>
          Promise.resolve({
            success: false,
            error: { code: "NOT_FOUND", message: "Request not awaiting review" },
          }),
      })

      const res = await fetch("http://localhost:3000/api/generator/requests/completed-req/submit-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentType: "resume",
          content: mockResumeContent,
        }),
      })

      expect(res.ok).toBe(false)
      expect(res.status).toBe(404)
    })
  })

  describe("Review Workflow Integration", () => {
    it("should complete full review workflow for resume", async () => {
      // Step 1: Generation returns awaiting_review
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            data: {
              requestId: "gen-review-1",
              status: "awaiting_review",
              nextStep: "review-resume",
              steps: [
                { id: "generate-resume", name: "Generate Resume", status: "completed" },
                { id: "review-resume", name: "Review Resume", status: "completed" },
                { id: "render-pdf", name: "Render PDF", status: "pending" },
              ],
            },
          }),
      })

      // Step 2: Fetch draft content
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            data: {
              requestId: "gen-review-1",
              documentType: "resume",
              content: mockResumeContent,
              status: "awaiting_review",
            },
          }),
      })

      // Step 3: Submit review
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            data: {
              nextStep: "render-pdf",
              status: "processing",
              steps: [],
            },
          }),
      })

      // Step 4: Continue to render-pdf
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            data: {
              requestId: "gen-review-1",
              status: "completed",
              nextStep: null,
              resumeUrl: "/api/generator/artifacts/resume.pdf",
              steps: [
                { id: "generate-resume", status: "completed" },
                { id: "review-resume", status: "completed" },
                { id: "render-pdf", status: "completed" },
              ],
            },
          }),
      })

      // Execute workflow
      const stepRes = await fetch("http://localhost:3000/api/generator/step/gen-review-1", { method: "POST" })
      const stepData = await stepRes.json()
      expect(stepData.data.status).toBe("awaiting_review")

      const draftRes = await fetch("http://localhost:3000/api/generator/requests/gen-review-1/draft")
      const draftData = await draftRes.json()
      expect(draftData.data.documentType).toBe("resume")

      const submitRes = await fetch("http://localhost:3000/api/generator/requests/gen-review-1/submit-review", {
        method: "POST",
        body: JSON.stringify({ documentType: "resume", content: mockResumeContent }),
      })
      const submitData = await submitRes.json()
      expect(submitData.data.nextStep).toBe("render-pdf")

      const finalRes = await fetch("http://localhost:3000/api/generator/step/gen-review-1", { method: "POST" })
      const finalData = await finalRes.json()
      expect(finalData.data.status).toBe("completed")
      expect(finalData.data.resumeUrl).toContain("resume.pdf")
    })

    it("should handle generation with both document types", async () => {
      // Both resume and cover letter should pause for review
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            data: {
              requestId: "gen-both",
              status: "awaiting_review",
              steps: [
                { id: "generate-resume", status: "completed" },
                { id: "review-resume", status: "completed" },
                { id: "generate-cover-letter", status: "pending" },
              ],
            },
          }),
      })

      const res = await fetch("http://localhost:3000/api/generator/step/gen-both", { method: "POST" })
      const data = await res.json()

      expect(data.success).toBe(true)
      expect(data.data.status).toBe("awaiting_review")
    })
  })

  describe("Content Validation Edge Cases", () => {
    it("should reject resume with missing required fields", () => {
      const invalidResume = {
        personalInfo: {
          name: "John",
          // missing title, summary, contact
        },
        professionalSummary: "Summary",
        experience: [],
      }

      const parsed = resumeContentSchema.safeParse(invalidResume)
      expect(parsed.success).toBe(false)
    })

    it("should reject cover letter with missing paragraphs", () => {
      const invalidCoverLetter = {
        greeting: "Hello",
        openingParagraph: "Opening",
        // missing bodyParagraphs, closingParagraph, signature
      }

      const parsed = coverLetterContentSchema.safeParse(invalidCoverLetter)
      expect(parsed.success).toBe(false)
    })

    it("should accept resume with optional fields omitted", () => {
      const minimalResume: ResumeContent = {
        personalInfo: {
          name: "John",
          title: "Engineer",
          summary: "Summary",
          contact: { email: "john@test.com" },
        },
        professionalSummary: "Professional summary text",
        experience: [],
        // skills and education are optional
      }

      const parsed = resumeContentSchema.safeParse(minimalResume)
      expect(parsed.success).toBe(true)
    })

    it("should accept cover letter with empty body paragraphs array", () => {
      const coverLetter: CoverLetterContent = {
        greeting: "Hello",
        openingParagraph: "Opening",
        bodyParagraphs: [], // Empty is valid
        closingParagraph: "Closing",
        signature: "Signature",
      }

      const parsed = coverLetterContentSchema.safeParse(coverLetter)
      expect(parsed.success).toBe(true)
    })
  })
})
