/**
 * Job Queue API Integration Tests
 */

import { describe, it, expect, beforeAll, beforeEach } from "vitest"
import { queueClient } from "@/api/queue-client"
import { signInTestUser, cleanupTestAuth, getIntegrationDescribe } from "../utils/testHelpers"
import {
  mockQueueItem,
  mockProcessingQueueItem,
  mockCompletedQueueItem,
  mockFailedQueueItem,
  mockQueueStats,
} from "../fixtures/mockData"

const describeIntegration = getIntegrationDescribe()

describeIntegration("Job Queue API Integration", () => {
  beforeAll(async () => {
    await signInTestUser("regular")
  })

  beforeEach(async () => {
    await cleanupTestAuth()
    await signInTestUser("regular")
  })

  describe("Queue item contract", () => {
    it("includes the required queue fields", () => {
      const item = mockQueueItem
      expect(item.id).toBeDefined()
      expect(item.type).toBe("job")
      expect(item.status).toBe("pending")
      expect(item.url).toContain("https://")
      expect(item.company_name.length).toBeGreaterThan(0)
      expect(item.source).toBe("user_submission")
      expect(item.retry_count).toBe(0)
      expect(item.max_retries).toBe(0)
    })

    it("captures processing lifecycle metadata", () => {
      expect(mockProcessingQueueItem.status).toBe("processing")
      expect(mockCompletedQueueItem.status).toBe("success")
      expect(mockFailedQueueItem.status).toBe("failed")
    })
  })

  describe("Status + stage validation", () => {
    it("only reports known queue statuses", () => {
      const valid: string[] = ["pending", "processing", "success", "failed", "skipped", "filtered"]
      const statuses = [
        mockQueueItem.status,
        mockProcessingQueueItem.status,
        mockCompletedQueueItem.status,
        mockFailedQueueItem.status,
      ]
      statuses.forEach((status) => expect(valid).toContain(status))
    })

    it("tracks completion + error details where relevant", () => {
      expect(mockCompletedQueueItem.completed_at).toBeInstanceOf(Date)
      expect(mockFailedQueueItem.error_details).toContain("Failed")
    })
  })

  describe("Queue statistics", () => {
    it("totals are consistent", () => {
      const sum =
        mockQueueStats.pending +
        mockQueueStats.processing +
        mockQueueStats.completed +
        mockQueueStats.failed +
        mockQueueStats.skipped
      expect(sum).toBe(mockQueueStats.total)
    })

    it("values are non-negative numbers", () => {
      Object.values(mockQueueStats).forEach((value) => {
        expect(typeof value).toBe("number")
        expect(value).toBeGreaterThanOrEqual(0)
      })
    })
  })

  describe("Client configuration", () => {
    it("exposes base client defaults", () => {
      expect(typeof queueClient.baseUrl).toBe("string")
      expect(queueClient.defaultTimeout).toBeGreaterThan(0)
      expect(queueClient.defaultRetryAttempts).toBeGreaterThanOrEqual(0)
    })
  })

  describe("Authentication", () => {
    it("returns a token when signed in", async () => {
      await signInTestUser("regular")
      const token = await queueClient.getAuthToken()
      expect(typeof token === "string" && token.length > 0).toBe(true)
    })

    it("returns null when signed out", async () => {
      await cleanupTestAuth()
      const token = await queueClient.getAuthToken()
      expect(token).toBeNull()
    })
  })

  describe("Timestamp helpers", () => {
    it("tracks creation + updates", () => {
      expect(mockQueueItem.created_at).toBeInstanceOf(Date)
      expect(mockQueueItem.updated_at).toBeInstanceOf(Date)
    })

    it("records completion timestamps when available", () => {
      expect(mockCompletedQueueItem.completed_at).toBeInstanceOf(Date)
    })
  })
})
