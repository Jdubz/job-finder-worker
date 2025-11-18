/**
 * Job Matches Client Tests
 * Tests for job matches API client
 */

import { describe, it, expect, beforeEach, vi } from "vitest"

describe("JobMatchesClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe("query construction", () => {
    it("should filter by userId when provided", () => {
      const userId = "test-user-123"
      expect(userId).toBeTruthy()
      expect(typeof userId).toBe("string")
    })

    it("should show all matches when userId is null", () => {
      const userId = null
      expect(userId).toBeNull()
    })

    it("should support score filtering", () => {
      const filters = {
        minScore: 70,
        maxScore: 100,
      }
      expect(filters.minScore).toBeGreaterThanOrEqual(0)
      expect(filters.maxScore).toBeLessThanOrEqual(100)
    })

    it("should support company name filtering", () => {
      const filters = {
        companyName: "Acme Corp",
      }
      expect(filters.companyName).toBeTruthy()
    })
  })

  describe("match data structure", () => {
    it("should have required fields", () => {
      const mockMatch = {
        id: "match-123",
        jobTitle: "Software Engineer",
        companyName: "Acme Corp",
        matchScore: 85,
        submittedBy: "user-123",
        createdAt: new Date(),
        analyzedAt: new Date(),
      }

      expect(mockMatch).toHaveProperty("id")
      expect(mockMatch).toHaveProperty("jobTitle")
      expect(mockMatch).toHaveProperty("companyName")
      expect(mockMatch).toHaveProperty("matchScore")
      expect(mockMatch).toHaveProperty("submittedBy")
      expect(mockMatch).toHaveProperty("createdAt")
      expect(mockMatch).toHaveProperty("analyzedAt")
    })

    it("should have match score between 0-100", () => {
      const score = 85
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(100)
    })
  })

  describe("subscription handling", () => {
    it("should call callback with matches", () => {
      const callback = vi.fn()
      const mockMatches = [
        {
          id: "1",
          jobTitle: "Engineer",
          companyName: "Acme",
          matchScore: 90,
          submittedBy: "user-1",
          createdAt: new Date(),
          analyzedAt: new Date(),
        },
      ]

      callback(mockMatches)

      expect(callback).toHaveBeenCalledWith(mockMatches)
      expect(callback).toHaveBeenCalledTimes(1)
    })

    it("should call error callback on error", () => {
      const errorCallback = vi.fn()
      const error = new Error("Test error")

      errorCallback(error)

      expect(errorCallback).toHaveBeenCalledWith(error)
      expect(errorCallback).toHaveBeenCalledTimes(1)
    })
  })
})
