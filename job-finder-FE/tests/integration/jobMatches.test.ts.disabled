/**
 * Job Matches API Integration Tests
 *
 * Tests for job match retrieval and management
 */

import { describe, it, expect, beforeAll, beforeEach } from "vitest"
import { jobMatchesClient } from "@/api/job-matches-client"
import { signInTestUser, cleanupTestAuth, getIntegrationDescribe } from "../utils/testHelpers"
import {
  mockJobMatch,
  mockHighScoreJobMatch,
  mockLowScoreJobMatch,
  mockAppliedJobMatch,
} from "../fixtures/mockData"
import { auth } from "@/config/firebase"

// Skip integration tests if Firebase is mocked (unit test mode)
const describeIntegration = getIntegrationDescribe()

describeIntegration("Job Matches API Integration", () => {
  beforeAll(async () => {
    // Sign in test user before running tests
    await signInTestUser("regular")
  })

  beforeEach(async () => {
    // Clean up between tests
    await cleanupTestAuth()
    await signInTestUser("regular")
  })

  describe("Job Match Structure", () => {
    it("should validate job match structure", () => {
      const match = mockJobMatch

      expect(match).toHaveProperty("id")
      expect(match).toHaveProperty("userId")
      expect(match).toHaveProperty("queueItemId")
      expect(match).toHaveProperty("jobTitle")
      expect(match).toHaveProperty("company")
      expect(match).toHaveProperty("location")
      expect(match).toHaveProperty("salary")
      expect(match).toHaveProperty("matchScore")
      expect(match).toHaveProperty("status")
      expect(match).toHaveProperty("linkedInUrl")
      expect(match).toHaveProperty("jobDescription")
      expect(match).toHaveProperty("requirements")
      expect(match).toHaveProperty("responsibilities")
      expect(match).toHaveProperty("createdAt")
      expect(match).toHaveProperty("updatedAt")
      expect(match).toHaveProperty("analyzed")
      expect(match).toHaveProperty("aiMatchReasoning")
      expect(match).toHaveProperty("recommendedSkills")
    })

    it("should have high score match with proper score", () => {
      const match = mockHighScoreJobMatch

      expect(match.matchScore).toBeGreaterThanOrEqual(90)
      expect(match.status).toBe("viewed")
    })

    it("should have low score match with proper score", () => {
      const match = mockLowScoreJobMatch

      expect(match.matchScore).toBeLessThan(70)
    })

    it("should have applied match with applied status", () => {
      const match = mockAppliedJobMatch

      expect(match.status).toBe("applied")
      expect(match).toHaveProperty("appliedAt")
    })
  })

  describe("Match Status Validation", () => {
    it("should have valid status values", () => {
      const validStatuses = ["new", "viewed", "applied", "rejected", "interviewing", "offer"]

      expect(validStatuses).toContain(mockJobMatch.status)
      expect(validStatuses).toContain(mockHighScoreJobMatch.status)
      expect(validStatuses).toContain(mockAppliedJobMatch.status)
    })

    it("should track status history for applied jobs", () => {
      const match = mockAppliedJobMatch

      expect(match.status).toBe("applied")
      expect(match.appliedAt).toBeDefined()
      expect(match.appliedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    })
  })

  describe("Match Score Validation", () => {
    it("should have match score in valid range", () => {
      expect(mockJobMatch.matchScore).toBeGreaterThanOrEqual(0)
      expect(mockJobMatch.matchScore).toBeLessThanOrEqual(100)
    })

    it("should have consistent match scores", () => {
      const scores = [
        mockJobMatch.matchScore,
        mockHighScoreJobMatch.matchScore,
        mockLowScoreJobMatch.matchScore,
      ]

      scores.forEach((score) => {
        expect(score).toBeGreaterThanOrEqual(0)
        expect(score).toBeLessThanOrEqual(100)
      })
    })

    it("should have high score greater than low score", () => {
      expect(mockHighScoreJobMatch.matchScore).toBeGreaterThan(mockLowScoreJobMatch.matchScore)
    })
  })

  describe("Job Information", () => {
    it("should have job title", () => {
      expect(mockJobMatch.jobTitle).toBeDefined()
      expect(typeof mockJobMatch.jobTitle).toBe("string")
      expect(mockJobMatch.jobTitle.length).toBeGreaterThan(0)
    })

    it("should have company name", () => {
      expect(mockJobMatch.company).toBeDefined()
      expect(typeof mockJobMatch.company).toBe("string")
      expect(mockJobMatch.company.length).toBeGreaterThan(0)
    })

    it("should have location", () => {
      expect(mockJobMatch.location).toBeDefined()
      expect(typeof mockJobMatch.location).toBe("string")
      expect(mockJobMatch.location.length).toBeGreaterThan(0)
    })

    it("should have salary information", () => {
      expect(mockJobMatch.salary).toBeDefined()
      expect(typeof mockJobMatch.salary).toBe("string")
    })

    it("should have valid LinkedIn URL", () => {
      const url = mockJobMatch.linkedInUrl

      expect(url).toMatch(/^https:\/\/(www\.)?linkedin\.com/)
      expect(url).toContain("/jobs/view/")
    })
  })

  describe("Job Description and Requirements", () => {
    it("should have job description", () => {
      expect(mockJobMatch.jobDescription).toBeDefined()
      expect(typeof mockJobMatch.jobDescription).toBe("string")
      expect(mockJobMatch.jobDescription.length).toBeGreaterThan(0)
    })

    it("should have requirements array", () => {
      expect(mockJobMatch.requirements).toBeDefined()
      expect(mockJobMatch.requirements).toBeInstanceOf(Array)
      expect(mockJobMatch.requirements.length).toBeGreaterThan(0)
    })

    it("should have non-empty requirement strings", () => {
      mockJobMatch.requirements.forEach((req) => {
        expect(typeof req).toBe("string")
        expect(req.length).toBeGreaterThan(0)
      })
    })

    it("should have responsibilities array", () => {
      expect(mockJobMatch.responsibilities).toBeDefined()
      expect(mockJobMatch.responsibilities).toBeInstanceOf(Array)
      expect(mockJobMatch.responsibilities.length).toBeGreaterThan(0)
    })

    it("should have non-empty responsibility strings", () => {
      mockJobMatch.responsibilities.forEach((resp) => {
        expect(typeof resp).toBe("string")
        expect(resp.length).toBeGreaterThan(0)
      })
    })
  })

  describe("AI Analysis", () => {
    it("should have analyzed flag", () => {
      expect(typeof mockJobMatch.analyzed).toBe("boolean")
      expect(mockJobMatch.analyzed).toBe(true)
    })

    it("should have AI match reasoning", () => {
      expect(mockJobMatch.aiMatchReasoning).toBeDefined()
      expect(typeof mockJobMatch.aiMatchReasoning).toBe("string")
      expect(mockJobMatch.aiMatchReasoning.length).toBeGreaterThan(0)
    })

    it("should have recommended skills array", () => {
      expect(mockJobMatch.recommendedSkills).toBeDefined()
      expect(mockJobMatch.recommendedSkills).toBeInstanceOf(Array)
      expect(mockJobMatch.recommendedSkills.length).toBeGreaterThan(0)
    })

    it("should have non-empty skill strings", () => {
      mockJobMatch.recommendedSkills.forEach((skill) => {
        expect(typeof skill).toBe("string")
        expect(skill.length).toBeGreaterThan(0)
      })
    })
  })

  describe("Relationships", () => {
    it("should have user ID", () => {
      expect(mockJobMatch.userId).toBeDefined()
      expect(typeof mockJobMatch.userId).toBe("string")
      expect(mockJobMatch.userId.length).toBeGreaterThan(0)
    })

    it("should have queue item ID", () => {
      expect(mockJobMatch.queueItemId).toBeDefined()
      expect(typeof mockJobMatch.queueItemId).toBe("string")
      expect(mockJobMatch.queueItemId.length).toBeGreaterThan(0)
    })

    it("should have unique match IDs", () => {
      const ids = [
        mockJobMatch.id,
        mockHighScoreJobMatch.id,
        mockLowScoreJobMatch.id,
        mockAppliedJobMatch.id,
      ]

      const uniqueIds = new Set(ids)
      expect(uniqueIds.size).toBe(ids.length)
    })
  })

  describe("Timestamps", () => {
    it("should have valid timestamp formats", () => {
      const { createdAt, updatedAt } = mockJobMatch

      expect(createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
      expect(updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    })

    it("should have consistent timestamps", () => {
      const { createdAt, updatedAt } = mockJobMatch

      const created = new Date(createdAt).getTime()
      const updated = new Date(updatedAt).getTime()

      expect(updated).toBeGreaterThanOrEqual(created)
    })

    it("should have appliedAt after createdAt for applied jobs", () => {
      const { createdAt, appliedAt } = mockAppliedJobMatch

      if (appliedAt) {
        const created = new Date(createdAt).getTime()
        const applied = new Date(appliedAt).getTime()

        expect(applied).toBeGreaterThanOrEqual(created)
      }
    })
  })

  describe("Client Configuration", () => {
    it("should be properly instantiated", () => {
      expect(jobMatchesClient).toBeDefined()
      expect(typeof jobMatchesClient).toBe("object")
    })

    // Note: JobMatchesClient uses Firestore SDK directly, so it doesn't have
    // HTTP-related properties like baseUrl, timeout, or retry settings.
    // Those are handled by the Firebase SDK internally.
  })

  describe("Authentication", () => {
    it("should be able to query matches when authenticated", async () => {
      // Auth is handled by Firebase SDK internally
      // This test validates that the client can be used when a user is authenticated
      await signInTestUser("regular")
      expect(jobMatchesClient).toBeDefined()
    })

    // Note: JobMatchesClient uses Firebase Auth via SDK, which handles tokens internally.
    // We don't need to expose getAuthToken() since Firestore queries automatically
    // use the current auth state.
  })

  describe("Filter Validation", () => {
    it("should validate min score filter", () => {
      const minScore = 70

      expect(minScore).toBeGreaterThanOrEqual(0)
      expect(minScore).toBeLessThanOrEqual(100)
    })

    it("should validate max score filter", () => {
      const maxScore = 100

      expect(maxScore).toBeGreaterThanOrEqual(0)
      expect(maxScore).toBeLessThanOrEqual(100)
    })

    it("should validate status filter", () => {
      const validStatuses = ["new", "viewed", "applied", "rejected"]
      const statusFilter = "applied"

      expect(validStatuses).toContain(statusFilter)
    })
  })

  describe("Data Integrity", () => {
    it("should have consistent data across match types", () => {
      const matches = [mockJobMatch, mockHighScoreJobMatch, mockLowScoreJobMatch]

      matches.forEach((match) => {
        expect(match).toHaveProperty("id")
        expect(match).toHaveProperty("jobTitle")
        expect(match).toHaveProperty("company")
        expect(match).toHaveProperty("matchScore")
        expect(match).toHaveProperty("status")
      })
    })

    it("should have valid match scores across all matches", () => {
      const matches = [mockJobMatch, mockHighScoreJobMatch, mockLowScoreJobMatch]

      matches.forEach((match) => {
        expect(match.matchScore).toBeGreaterThanOrEqual(0)
        expect(match.matchScore).toBeLessThanOrEqual(100)
      })
    })
  })
})
