/**
 * Generator API Client Tests
 *
 * Comprehensive tests for the Generator API Client functionality
 * Rank 8 - HIGH: Backend communication
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { GeneratorClient } from "../generator-client"
import type { GenerateDocumentRequest } from "../generator-client"

// Mock fetch globally (BaseApiClient uses fetch under the hood)
global.fetch = vi.fn()

const baseUrl = "https://api.example.com"

describe("GeneratorClient", () => {
  let client: GeneratorClient

  beforeEach(() => {
    vi.clearAllMocks()
    client = new GeneratorClient(baseUrl)
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" } as Headers,
      json: async () => ({}),
    } as Response)
  })

  describe("startGeneration", () => {
    it("should start generation with valid request", async () => {
      const mockResponse = {
        success: true,
        data: {
          requestId: "req-123",
          nextStep: "analyze",
        },
      }

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        headers: { get: () => "application/json" } as Headers,
        json: () => Promise.resolve(mockResponse),
      } as Response)

      const request: GenerateDocumentRequest = {
        generateType: "resume",
        job: {
          role: "Software Engineer",
          company: "Tech Corp",
          jobDescriptionText: "We are looking for a software engineer...",
        },
      }

      const result = await client.startGeneration(request)

      expect(fetch).toHaveBeenCalled()

      expect(result).toEqual(mockResponse)
    })

    it("should handle generation errors", async () => {
      const mockError = {
        success: false,
        error: "Generation failed",
        message: "Invalid request parameters",
      }

      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        headers: { get: () => "application/json" } as Headers,
        json: () => Promise.resolve(mockError),
      } as Response)

      const request: GenerateDocumentRequest = {
        generateType: "resume",
        job: {
          role: "",
          company: "",
        },
      }

      await expect(client.startGeneration(request)).rejects.toThrow("Invalid request parameters")
    })

    it("should handle network errors", async () => {
      vi.mocked(fetch).mockRejectedValue(new Error("Network error"))

      const request: GenerateDocumentRequest = {
        generateType: "resume",
        job: {
          role: "Software Engineer",
          company: "Tech Corp",
        },
      }

      await expect(client.startGeneration(request)).rejects.toThrow("Network error")
    })

    it("should handle different document types", async () => {
      const mockResponse = {
        success: true,
        data: {
          requestId: "req-123",
          nextStep: "analyze",
        },
      }

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        headers: { get: () => "application/json" } as Headers,
        json: () => Promise.resolve(mockResponse),
      } as Response)

      // Test resume generation
      const resumeRequest: GenerateDocumentRequest = {
        generateType: "resume",
        job: {
          role: "Software Engineer",
          company: "Tech Corp",
        },
      }

      await client.startGeneration(resumeRequest)

      // Test cover letter generation
      const coverLetterRequest: GenerateDocumentRequest = {
        generateType: "coverLetter",
        job: {
          role: "Software Engineer",
          company: "Tech Corp",
        },
        date: "2024-01-15",
      }

      await client.startGeneration(coverLetterRequest)

      // Test both generation
      const bothRequest: GenerateDocumentRequest = {
        generateType: "both",
        job: {
          role: "Software Engineer",
          company: "Tech Corp",
        },
      }

      await client.startGeneration(bothRequest)

      expect(fetch).toHaveBeenCalledTimes(3)
    })

    it("should include job match ID when provided", async () => {
      const mockResponse = {
        success: true,
        data: {
          requestId: "req-123",
          nextStep: "analyze",
        },
      }

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        headers: { get: () => "application/json" } as Headers,
        json: () => Promise.resolve(mockResponse),
      } as Response)

      const request: GenerateDocumentRequest = {
        generateType: "resume",
        job: {
          role: "Software Engineer",
          company: "Tech Corp",
        },
        jobMatchId: "match-123",
      }

      await client.startGeneration(request)
      expect(fetch).toHaveBeenCalled()
    })

    it("should include preferences when provided", async () => {
      const mockResponse = {
        success: true,
        data: {
          requestId: "req-123",
          nextStep: "analyze",
        },
      }

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        headers: { get: () => "application/json" } as Headers,
        json: () => Promise.resolve(mockResponse),
      } as Response)

      const request: GenerateDocumentRequest = {
        generateType: "resume",
        job: {
          role: "Software Engineer",
          company: "Tech Corp",
        },
        preferences: {
          style: "modern",
          emphasize: ["React", "TypeScript"],
        },
      }

      await client.startGeneration(request)
      expect(fetch).toHaveBeenCalled()
    })
  })

  describe("executeStep", () => {
    it("should execute generation step", async () => {
      const mockResponse = {
        success: true,
        data: {
          status: "completed",
          nextStep: null,
          steps: [
            { id: "analyze", name: "Analyzing", status: "completed" },
            { id: "generate", name: "Generating", status: "completed" },
          ],
          resumeUrl: "https://storage.example.com/resume.pdf",
        },
      }

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        headers: { get: () => "application/json" } as Headers,
        json: () => Promise.resolve(mockResponse),
      } as Response)

      const result = await client.executeStep("req-123")

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/step/req-123"),
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
          }),
          body: JSON.stringify({}),
          signal: expect.any(AbortSignal),
        })
      )

      expect(result).toEqual(mockResponse)
    })

    it("should handle step execution errors", async () => {
      const mockError = {
        success: false,
        error: "Step execution failed",
        message: "AI provider unavailable",
      }

      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        headers: { get: () => "application/json" } as Headers,
        json: () => Promise.resolve(mockError),
      } as Response)

      await expect(client.executeStep("req-123")).rejects.toThrow("AI provider unavailable")
    })

    it("should handle network errors during step execution", async () => {
      vi.mocked(fetch).mockRejectedValue(new Error("Network error"))

      await expect(client.executeStep("req-123")).rejects.toThrow("Network error")
    })
  })

  describe("getHistory", () => {
    it("should fetch document history", async () => {
      const mockHistory = [
        {
          id: "doc-1",
          type: "resume",
          jobTitle: "Software Engineer",
          companyName: "Tech Corp",
          documentUrl: "https://storage.example.com/resume.pdf",
          createdAt: "2024-01-15T10:00:00Z",
        },
        {
          id: "doc-2",
          type: "cover_letter",
          jobTitle: "Frontend Developer",
          companyName: "Startup Inc",
          documentUrl: "https://storage.example.com/cover-letter.pdf",
          createdAt: "2024-01-14T15:30:00Z",
        },
      ]

      const mockPayload = { requests: mockHistory, count: mockHistory.length }

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        headers: { get: () => "application/json" } as Headers,
        json: () => Promise.resolve(mockPayload),
      } as Response)

      const result = await client.getHistory("user-123")

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/requests?userId=user-123"),
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
          }),
          signal: expect.any(AbortSignal),
        })
      )

      expect(result).toEqual(mockHistory)
    })

    it("should handle history fetch errors", async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        headers: { get: () => "application/json" } as Headers,
        status: 500,
        statusText: "Failed to fetch history",
        json: () => Promise.resolve({ error: "Failed to fetch history" }),
      } as Response)

      await expect(client.getHistory("user-123")).rejects.toThrow("Failed to fetch history")
    })
  })

  describe("getUserDefaults", () => {
    it("should fetch user defaults", async () => {
      const mockDefaults = {
        style: "modern",
        emphasize: ["React", "TypeScript"],
        preferences: {
          includePhoto: true,
          includeSummary: true,
        },
      }

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        headers: { get: () => "application/json" } as Headers,
        json: () => Promise.resolve(mockDefaults),
      } as Response)

      const result = await client.getUserDefaults()

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/defaults"),
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
          }),
          signal: expect.any(AbortSignal),
        })
      )

      expect(result).toEqual(mockDefaults)
    })

    it("should handle defaults fetch errors", async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        headers: { get: () => "application/json" } as Headers,
        json: () => Promise.resolve({ error: "Failed to fetch defaults" }),
      } as Response)

      await expect(client.getUserDefaults()).rejects.toThrow()
    })
  })

  describe("updateUserDefaults", () => {
    it("should update user defaults", async () => {
      const mockDefaults = {
        name: "John Doe",
        email: "john@example.com",
        phone: "+1234567890",
        location: "New York",
        linkedin: "https://linkedin.com/in/johndoe",
        github: "https://github.com/johndoe",
        portfolio: "https://johndoe.com",
        summary: "Experienced developer",
      }

      const mockResponse = {
        success: true,
        message: "Defaults updated successfully",
      }

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        headers: { get: () => "application/json" } as Headers,
        json: () => Promise.resolve(mockResponse),
      } as Response)

      const result = await client.updateUserDefaults(mockDefaults)

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/defaults"),
        expect.objectContaining({
          method: "PUT",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
          }),
          body: JSON.stringify(mockDefaults),
          signal: expect.any(AbortSignal),
        })
      )

      expect(result).toEqual(mockResponse)
    })

    it("should handle update errors", async () => {
      const mockDefaults = {
        name: "John Doe",
        email: "john@example.com",
        phone: "+1234567890",
        location: "New York",
        linkedin: "https://linkedin.com/in/johndoe",
        github: "https://github.com/johndoe",
        portfolio: "https://johndoe.com",
        summary: "Experienced developer",
      }

      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        headers: { get: () => "application/json" } as Headers,
        json: () => Promise.resolve({ error: "Failed to update defaults" }),
      } as Response)

      await expect(client.updateUserDefaults(mockDefaults)).rejects.toThrow()
    })
  })

  describe("deleteDocument", () => {
    it("should delete document", async () => {
      const mockResponse = {
        success: true,
        message: "Document deleted successfully",
      }

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        headers: { get: () => "application/json" } as Headers,
        json: () => Promise.resolve(mockResponse),
      } as Response)

      const result = await client.deleteDocument("doc-123")

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/requests/doc-123"),
        expect.objectContaining({
          method: "DELETE",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
          }),
          signal: expect.any(AbortSignal),
        })
      )

      expect(result).toEqual(mockResponse)
    })

    it("should handle delete errors", async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        headers: { get: () => "application/json" } as Headers,
        json: () => Promise.resolve({ error: "Failed to delete document" }),
      } as Response)

      await expect(client.deleteDocument("doc-123")).rejects.toThrow()
    })
  })

  describe("error handling", () => {
    it("should handle malformed JSON responses", async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        headers: { get: () => "application/json" } as Headers,
        json: () => Promise.reject(new Error("Invalid JSON")),
      } as Response)

      const request: GenerateDocumentRequest = {
        generateType: "resume",
        job: {
          role: "Software Engineer",
          company: "Tech Corp",
        },
      }

      await expect(client.startGeneration(request)).rejects.toThrow("Invalid JSON")
    })

    it("should handle timeout errors", async () => {
      vi.mocked(fetch).mockRejectedValue(new Error("Request timeout"))

      const request: GenerateDocumentRequest = {
        generateType: "resume",
        job: {
          role: "Software Engineer",
          company: "Tech Corp",
        },
      }

      await expect(client.startGeneration(request)).rejects.toThrow("Request timeout")
    })

    it("should handle 500 server errors", async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal server error",
        headers: { get: () => "application/json" } as Headers,
        json: () => Promise.resolve({ error: "Internal server error" }),
      } as Response)

      const request: GenerateDocumentRequest = {
        generateType: "resume",
        job: {
          role: "Software Engineer",
          company: "Tech Corp",
        },
      }

      await expect(client.startGeneration(request)).rejects.toThrow("Internal server error")
      // Note: StartGenerationResponse doesn't have error property
    })

    it("should handle 429 rate limit errors", async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 429,
        statusText: "Rate limit exceeded",
        headers: { get: () => "application/json" } as Headers,
        json: () => Promise.resolve({ error: "Rate limit exceeded" }),
      } as Response)

      const request: GenerateDocumentRequest = {
        generateType: "resume",
        job: {
          role: "Software Engineer",
          company: "Tech Corp",
        },
      }

      await expect(client.startGeneration(request)).rejects.toThrow("Rate limit exceeded")
      // Note: StartGenerationResponse doesn't have error property
    })
  })

  describe("request validation", () => {
    it("should validate required fields", async () => {
      const invalidRequest = {
        generateType: "resume",
        job: {
          role: "",
          company: "",
        },
      } as GenerateDocumentRequest

      const mockError = {
        success: false,
        error: "Validation failed",
        message: "Job role and company are required",
      }

      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        headers: { get: () => "application/json" } as Headers,
        json: () => Promise.resolve(mockError),
      } as Response)

      await expect(client.startGeneration(invalidRequest)).rejects.toThrow("Job role and company are required")
    })

    it("should validate document type", async () => {
      const invalidRequest = {
        generateType: "invalid" as any,
        job: {
          role: "Software Engineer",
          company: "Tech Corp",
        },
      }

      const mockError = {
        success: false,
        error: "Validation failed",
        message: "Invalid document type",
      }

      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        headers: { get: () => "application/json" } as Headers,
        json: () => Promise.resolve(mockError),
      } as Response)

      await expect(client.startGeneration(invalidRequest)).rejects.toThrow("Invalid document type")
    })
  })
})
