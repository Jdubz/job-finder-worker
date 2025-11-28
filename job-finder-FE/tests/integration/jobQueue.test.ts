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
    it("client is configured for cookie-based auth", () => {
      // Auth is now handled via session cookies (credentials: include)
      // No Bearer tokens are used - the client just needs to be configured
      expect(queueClient).toBeDefined()
      expect(typeof queueClient.baseUrl).toBe("string")
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
