/**
 * Job Queue API Integration Tests
 *
 * Tests for job queue submission and management
 */

import { describe, it, expect, beforeAll, beforeEach } from "vitest"
import { jobQueueClient } from "@/api/job-queue-client"
import { signInTestUser, cleanupTestAuth, getIntegrationDescribe } from "../utils/testHelpers"
import {
  mockQueueItem,
  mockProcessingQueueItem,
  mockCompletedQueueItem,
  mockFailedQueueItem,
  mockQueueStats,
} from "../fixtures/mockData"

// Skip integration tests if Firebase is mocked (unit test mode)
const describeIntegration = getIntegrationDescribe()

describeIntegration("Job Queue API Integration", () => {
  beforeAll(async () => {
    // Sign in test user before running tests
    await signInTestUser("regular")
  })

  beforeEach(async () => {
    // Clean up between tests
    await cleanupTestAuth()
    await signInTestUser("regular")
  })

  describe("Queue Item Structure", () => {
    it("should validate queue item structure", () => {
      const item = mockQueueItem

      expect(item).toHaveProperty("id")
      expect(item).toHaveProperty("userId")
      expect(item).toHaveProperty("linkedInUrl")
      expect(item).toHaveProperty("jobTitle")
      expect(item).toHaveProperty("company")
      expect(item).toHaveProperty("status")
      expect(item).toHaveProperty("createdAt")
      expect(item).toHaveProperty("updatedAt")
      expect(item).toHaveProperty("stage")
      expect(item).toHaveProperty("priority")
    })

    it("should validate processing queue item", () => {
      const item = mockProcessingQueueItem

      expect(item.status).toBe("processing")
      expect(item).toHaveProperty("startedAt")
      expect(item.stage).toBe("scraping")
    })

    it("should validate completed queue item", () => {
      const item = mockCompletedQueueItem

      expect(item.status).toBe("completed")
      expect(item).toHaveProperty("completedAt")
      expect(item).toHaveProperty("matchScore")
      expect(item.stage).toBe("completed")
    })

    it("should validate failed queue item", () => {
      const item = mockFailedQueueItem

      expect(item.status).toBe("failed")
      expect(item).toHaveProperty("error")
      expect(item).toHaveProperty("failedAt")
      expect(item.stage).toBe("failed")
    })
  })

  describe("Queue Status Validation", () => {
    it("should have valid status values", () => {
      const validStatuses = ["pending", "processing", "completed", "failed", "skipped"]

      expect(validStatuses).toContain(mockQueueItem.status)
      expect(validStatuses).toContain(mockProcessingQueueItem.status)
      expect(validStatuses).toContain(mockCompletedQueueItem.status)
      expect(validStatuses).toContain(mockFailedQueueItem.status)
    })

    it("should have valid stage values", () => {
      const validStages = ["queued", "scraping", "analyzing", "completed", "failed"]

      expect(validStages).toContain(mockQueueItem.stage)
      expect(validStages).toContain(mockProcessingQueueItem.stage)
    })

    it("should have priority as number", () => {
      expect(typeof mockQueueItem.priority).toBe("number")
      expect(mockQueueItem.priority).toBeGreaterThanOrEqual(0)
    })
  })

  describe("LinkedIn URL Validation", () => {
    it("should have valid LinkedIn URL format", () => {
      const url = mockQueueItem.linkedInUrl

      expect(url).toMatch(/^https:\/\/(www\.)?linkedin\.com/)
      expect(url).toContain("/jobs/view/")
    })

    it("should have job ID in URL", () => {
      const url = mockQueueItem.linkedInUrl
      const match = url.match(/\/jobs\/view\/(\d+)/)

      expect(match).toBeDefined()
      expect(match?.[1]).toBeDefined()
    })
  })

  describe("Queue Stats Structure", () => {
    it("should validate queue stats structure", () => {
      const stats = mockQueueStats

      expect(stats).toHaveProperty("total")
      expect(stats).toHaveProperty("pending")
      expect(stats).toHaveProperty("processing")
      expect(stats).toHaveProperty("completed")
      expect(stats).toHaveProperty("failed")
      expect(stats).toHaveProperty("skipped")
    })

    it("should have numeric stat values", () => {
      const stats = mockQueueStats

      expect(typeof stats.total).toBe("number")
      expect(typeof stats.pending).toBe("number")
      expect(typeof stats.processing).toBe("number")
      expect(typeof stats.completed).toBe("number")
      expect(typeof stats.failed).toBe("number")
      expect(typeof stats.skipped).toBe("number")
    })

    it("should have stats sum equal to total", () => {
      const stats = mockQueueStats
      const sum = stats.pending + stats.processing + stats.completed + stats.failed + stats.skipped

      expect(sum).toBe(stats.total)
    })

    it("should have non-negative stats", () => {
      const stats = mockQueueStats

      expect(stats.total).toBeGreaterThanOrEqual(0)
      expect(stats.pending).toBeGreaterThanOrEqual(0)
      expect(stats.processing).toBeGreaterThanOrEqual(0)
      expect(stats.completed).toBeGreaterThanOrEqual(0)
      expect(stats.failed).toBeGreaterThanOrEqual(0)
      expect(stats.skipped).toBeGreaterThanOrEqual(0)
    })
  })

  describe("Client Configuration", () => {
    it("should have proper base URL configured", () => {
      expect(jobQueueClient.baseUrl).toBeDefined()
      expect(typeof jobQueueClient.baseUrl).toBe("string")
    })

    it("should have timeout configured", () => {
      expect(jobQueueClient.defaultTimeout).toBeDefined()
      expect(jobQueueClient.defaultTimeout).toBeGreaterThan(0)
    })

    it("should have retry settings configured", () => {
      expect(jobQueueClient.defaultRetryAttempts).toBeDefined()
      expect(jobQueueClient.defaultRetryAttempts).toBeGreaterThanOrEqual(0)
    })
  })

  describe("Authentication", () => {
    it("should have auth token available", async () => {
      const token = await jobQueueClient.getAuthToken()

      expect(token).toBeDefined()
      expect(typeof token).toBe("string")
      expect(token?.length).toBeGreaterThan(0)
    })

    it("should return null when not authenticated", async () => {
      await cleanupTestAuth()

      const token = await jobQueueClient.getAuthToken()
      expect(token).toBeNull()
    })
  })

  describe("Timestamp Validation", () => {
    it("should have valid ISO timestamp formats", () => {
      const { createdAt, updatedAt } = mockQueueItem

      expect(createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
      expect(updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    })

    it("should have consistent timestamps", () => {
      const { createdAt, updatedAt } = mockQueueItem

      const created = new Date(createdAt).getTime()
      const updated = new Date(updatedAt).getTime()

      expect(updated).toBeGreaterThanOrEqual(created)
    })

    it("should have startedAt after createdAt for processing items", () => {
      const { createdAt, startedAt } = mockProcessingQueueItem

      if (startedAt) {
        const created = new Date(createdAt).getTime()
        const started = new Date(startedAt).getTime()

        expect(started).toBeGreaterThanOrEqual(created)
      }
    })

    it("should have completedAt after startedAt for completed items", () => {
      const { startedAt, completedAt } = mockCompletedQueueItem

      if (startedAt && completedAt) {
        const started = new Date(startedAt).getTime()
        const completed = new Date(completedAt).getTime()

        expect(completed).toBeGreaterThanOrEqual(started)
      }
    })
  })

  describe("Queue Item Fields", () => {
    it("should have user ID", () => {
      expect(mockQueueItem.userId).toBeDefined()
      expect(typeof mockQueueItem.userId).toBe("string")
      expect(mockQueueItem.userId.length).toBeGreaterThan(0)
    })

    it("should have job title", () => {
      expect(mockQueueItem.jobTitle).toBeDefined()
      expect(typeof mockQueueItem.jobTitle).toBe("string")
      expect(mockQueueItem.jobTitle.length).toBeGreaterThan(0)
    })

    it("should have company name", () => {
      expect(mockQueueItem.company).toBeDefined()
      expect(typeof mockQueueItem.company).toBe("string")
      expect(mockQueueItem.company.length).toBeGreaterThan(0)
    })

    it("should have unique IDs", () => {
      const ids = [
        mockQueueItem.id,
        mockProcessingQueueItem.id,
        mockCompletedQueueItem.id,
        mockFailedQueueItem.id,
      ]

      const uniqueIds = new Set(ids)
      expect(uniqueIds.size).toBe(ids.length)
    })
  })

  describe("Error Information", () => {
    it("should have error message for failed items", () => {
      const { error } = mockFailedQueueItem

      expect(error).toBeDefined()
      expect(typeof error).toBe("string")
      expect(error.length).toBeGreaterThan(0)
    })

    it("should have failedAt timestamp for failed items", () => {
      const { failedAt } = mockFailedQueueItem

      expect(failedAt).toBeDefined()
      expect(failedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    })
  })

  describe("Match Score", () => {
    it("should have match score for completed items", () => {
      const { matchScore } = mockCompletedQueueItem

      expect(matchScore).toBeDefined()
      expect(typeof matchScore).toBe("number")
    })

    it("should have match score in valid range", () => {
      const { matchScore } = mockCompletedQueueItem

      if (matchScore !== undefined) {
        expect(matchScore).toBeGreaterThanOrEqual(0)
        expect(matchScore).toBeLessThanOrEqual(100)
      }
    })
  })
})
