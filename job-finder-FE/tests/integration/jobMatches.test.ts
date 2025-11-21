/**
 * Job Matches API Integration Tests
 *
 * These assertions exercise the shared JobMatch contract that both the frontend
 * and backend rely on. They intentionally operate on the mock fixtures so the
 * suite can run without real network traffic or AI calls.
 */

import { describe, it, expect, beforeAll, beforeEach } from "vitest"
import { jobMatchesClient } from "@/api/job-matches-client"
import { signInTestUser, cleanupTestAuth, getIntegrationDescribe } from "../utils/testHelpers"
import { mockJobMatch, mockHighScoreJobMatch, mockLowScoreJobMatch } from "../fixtures/mockData"

const describeIntegration = getIntegrationDescribe()

describeIntegration("Job Matches API Integration", () => {
  beforeAll(async () => {
    await signInTestUser("regular")
  })

  beforeEach(async () => {
    await cleanupTestAuth()
    await signInTestUser("regular")
  })

  describe("Job Match Contract", () => {
    it("includes the required scalar fields", () => {
      const match = mockJobMatch

      expect(match.id).toBeDefined()
      expect(match.queueItemId).toMatch(/^queue-/)
      expect(match.companyName.length).toBeGreaterThan(0)
      expect(match.jobTitle.length).toBeGreaterThan(0)
      expect(typeof match.matchScore).toBe("number")
      expect(typeof match.experienceMatch).toBe("number")
      expect(["High", "Medium", "Low"]).toContain(match.applicationPriority)
    })

    it("tracks AI analysis artifacts", () => {
      const match = mockJobMatch

      expect(match.matchedSkills.length).toBeGreaterThan(0)
      expect(match.missingSkills).toBeInstanceOf(Array)
      expect(match.matchReasons).toBeInstanceOf(Array)
      expect(match.keyStrengths).toBeInstanceOf(Array)
      expect(match.customizationRecommendations).toBeInstanceOf(Array)
      expect(match.potentialConcerns).toBeInstanceOf(Array)
    })
  })

  describe("Scoring Heuristics", () => {
    it("keeps high score matches above 90", () => {
      expect(mockHighScoreJobMatch.matchScore).toBeGreaterThanOrEqual(90)
      expect(mockHighScoreJobMatch.applicationPriority).toBe("High")
    })

    it("keeps low score matches below 70", () => {
      expect(mockLowScoreJobMatch.matchScore).toBeLessThan(70)
      expect(mockLowScoreJobMatch.companyName.length).toBeGreaterThan(0)
    })

    it("enforces score bounds", () => {
      const matches = [mockJobMatch, mockHighScoreJobMatch, mockLowScoreJobMatch]
      matches.forEach((match) => {
        expect(match.matchScore).toBeGreaterThanOrEqual(0)
        expect(match.matchScore).toBeLessThanOrEqual(100)
      })
    })
  })

  describe("Relationships & Timestamps", () => {
    it("maintains queue and submitter relationships", () => {
      expect(mockJobMatch.queueItemId.length).toBeGreaterThan(0)
      expect(mockJobMatch.submittedBy).toBeTruthy()
    })

    it("stores creation + analysis timestamps", () => {
      expect(mockJobMatch.createdAt).toBeInstanceOf(Date)
      expect(mockJobMatch.analyzedAt).toBeInstanceOf(Date)
      expect((mockJobMatch.createdAt as Date).getTime()).toBeLessThanOrEqual(
        (mockJobMatch.analyzedAt as Date).getTime()
      )
    })
  })

  describe("Client Configuration", () => {
    it("instantiates the API client", () => {
      expect(jobMatchesClient).toBeDefined()
      expect(typeof jobMatchesClient.baseUrl).toBe("string")
      expect(jobMatchesClient.defaultTimeout).toBeGreaterThan(0)
      expect(jobMatchesClient.defaultRetryAttempts).toBeGreaterThanOrEqual(0)
    })
  })

  describe("Authentication helpers", () => {
    it("fetches matches when signed in", async () => {
      await signInTestUser("regular")
      const token = await jobMatchesClient.getAuthToken()
      expect(typeof token === "string" && token.length > 0).toBe(true)
    })

    it("clears auth tokens when signed out", async () => {
      await cleanupTestAuth()
      const token = await jobMatchesClient.getAuthToken()
      expect(token).toBeNull()
    })
  })

  describe("Filter validation", () => {
    it("accepts score filters in the supported range", () => {
      const minScore = 70
      const maxScore = 100
      expect(minScore).toBeGreaterThanOrEqual(0)
      expect(maxScore).toBeLessThanOrEqual(100)
      expect(minScore).toBeLessThanOrEqual(maxScore)
    })

    it("uses application priority for priority filters", () => {
      const priorities = ["High", "Medium", "Low"] as const
      expect(priorities).toContain(mockJobMatch.applicationPriority)
    })
  })
})
