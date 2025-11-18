/**
 * Tests for JobQueueService
 */

import { JobQueueService } from "../../services/job-queue.service"
import { createMockLogger } from "../helpers/test-utils"

// Mock the firestore config
jest.mock("../../config/firestore", () => ({
  createFirestoreInstance: jest.fn(() => mockFirestore),
}))

// Create mock Firestore instance
const mockFirestore: any = {
  collection: jest.fn(),
}

describe("JobQueueService", () => {
  let service: JobQueueService
  let mockLogger: ReturnType<typeof createMockLogger>
  let mockQueueCollection: any
  let mockConfigCollection: any
  let mockDocRef: any

  beforeEach(() => {
    jest.clearAllMocks()

    // Reset mock document reference
    mockDocRef = {
      id: "test-queue-item-id",
      get: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    }

    // Reset mock queue collection
    mockQueueCollection = {
      add: jest.fn().mockResolvedValue(mockDocRef),
      doc: jest.fn().mockReturnValue(mockDocRef),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      get: jest.fn(),
    }

    // Reset mock config collection
    mockConfigCollection = {
      doc: jest.fn().mockReturnValue(mockDocRef),
    }

    // Mock collection method to return appropriate collection
    mockFirestore.collection.mockImplementation((name: string) => {
      if (name === "job-queue") return mockQueueCollection
      if (name === "job-finder-config") return mockConfigCollection
      return mockQueueCollection
    })

    mockLogger = createMockLogger()
    service = new JobQueueService(mockLogger)
  })

  describe("submitJob", () => {
    it("should submit a job to the queue successfully", async () => {
      // Mock queue settings
      mockDocRef.get.mockResolvedValue({
        exists: true,
        data: () => ({
          maxRetries: 3,
          retryDelaySeconds: 300,
          processingTimeout: 3600,
        }),
      })

      const result = await service.submitJob(
        "https://example.com/job/123",
        "Test Company",
        "user-123"
      )

      expect(result.id).toBe("test-queue-item-id")
      expect(result.type).toBe("job")
      expect(result.status).toBe("pending")
      expect(result.url).toBe("https://example.com/job/123")
      expect(result.company_name).toBe("Test Company")
      expect(result.submitted_by).toBe("user-123")
      expect(result.retry_count).toBe(0)
      expect(result.max_retries).toBe(3)

      expect(mockQueueCollection.add).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "job",
          status: "pending",
          url: "https://example.com/job/123",
          company_name: "Test Company",
          submitted_by: "user-123",
        })
      )

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Job submitted to queue",
        expect.objectContaining({
          queueItemId: "test-queue-item-id",
          url: "https://example.com/job/123",
          userId: "user-123",
        })
      )
    })

    it("should submit job with pre-generated documents", async () => {
      mockDocRef.get.mockResolvedValue({
        exists: true,
        data: () => ({
          maxRetries: 3,
          retryDelaySeconds: 300,
          processingTimeout: 3600,
        }),
      })

      const result = await service.submitJob(
        "https://example.com/job/123",
        "Test Company",
        "user-123",
        "gen-abc-123"
      )

      expect(result.status).toBe("success")
      expect(result.result_message).toBe("Documents already generated via Document Builder")
      expect(result.metadata).toEqual({
        generationId: "gen-abc-123",
        documentsPreGenerated: true,
      })

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Job submitted to queue",
        expect.objectContaining({
          hasPreGeneratedDocs: true,
        })
      )
    })

    it("should handle anonymous submissions with null userId", async () => {
      mockDocRef.get.mockResolvedValue({
        exists: true,
        data: () => ({ maxRetries: 3, retryDelaySeconds: 300, processingTimeout: 3600 }),
      })

      const result = await service.submitJob(
        "https://example.com/job/123",
        "Test Company",
        null
      )

      expect(result.submitted_by).toBeNull()
    })

    it("should handle empty company name", async () => {
      mockDocRef.get.mockResolvedValue({
        exists: true,
        data: () => ({ maxRetries: 3, retryDelaySeconds: 300, processingTimeout: 3600 }),
      })

      const result = await service.submitJob(
        "https://example.com/job/123",
        undefined,
        "user-123"
      )

      expect(result.company_name).toBe("")
    })

    it("should throw and log error on Firestore failure", async () => {
      mockDocRef.get.mockResolvedValue({
        exists: true,
        data: () => ({ maxRetries: 3, retryDelaySeconds: 300, processingTimeout: 3600 }),
      })

      const testError = new Error("Firestore error")
      mockQueueCollection.add.mockRejectedValue(testError)

      await expect(
        service.submitJob("https://example.com/job/123", "Test Company", "user-123")
      ).rejects.toThrow("Firestore error")

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to submit job to queue",
        expect.objectContaining({
          error: testError,
          url: "https://example.com/job/123",
          userId: "user-123",
        })
      )
    })
  })

  describe("submitCompany", () => {
    it("should submit a company to the queue successfully", async () => {
      mockDocRef.get.mockResolvedValue({
        exists: true,
        data: () => ({ maxRetries: 3, retryDelaySeconds: 300, processingTimeout: 3600 }),
      })

      const result = await service.submitCompany(
        "Test Company",
        "https://example.com",
        "manual_submission",
        "user-123"
      )

      expect(result.id).toBe("test-queue-item-id")
      expect(result.type).toBe("company")
      expect(result.status).toBe("pending")
      expect(result.company_name).toBe("Test Company")
      expect(result.url).toBe("https://example.com")
      expect(result.source).toBe("manual_submission")
      expect(result.company_sub_task).toBe("fetch")

      expect(mockQueueCollection.add).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "company",
          status: "pending",
          company_name: "Test Company",
          url: "https://example.com",
          source: "manual_submission",
        })
      )

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Company submitted to queue",
        expect.objectContaining({
          queueItemId: "test-queue-item-id",
          companyName: "Test Company",
          websiteUrl: "https://example.com",
        })
      )
    })

    it("should throw and log error on failure", async () => {
      mockDocRef.get.mockResolvedValue({
        exists: true,
        data: () => ({ maxRetries: 3, retryDelaySeconds: 300, processingTimeout: 3600 }),
      })

      const testError = new Error("Firestore error")
      mockQueueCollection.add.mockRejectedValue(testError)

      await expect(
        service.submitCompany("Test Company", "https://example.com", "manual_submission", "user-123")
      ).rejects.toThrow("Firestore error")

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to submit company to queue",
        expect.objectContaining({
          error: testError,
        })
      )
    })
  })

  describe("getQueueStatus", () => {
    it("should return queue item status", async () => {
      const mockQueueItem = {
        type: "job",
        status: "processing",
        url: "https://example.com/job/123",
        company_name: "Test Company",
        submitted_by: "user-123",
        retry_count: 0,
        max_retries: 3,
      }

      mockDocRef.get.mockResolvedValue({
        exists: true,
        id: "test-queue-item-id",
        data: () => mockQueueItem,
      })

      const result = await service.getQueueStatus("test-queue-item-id")

      expect(result).toEqual({
        id: "test-queue-item-id",
        ...mockQueueItem,
      })
      expect(mockQueueCollection.doc).toHaveBeenCalledWith("test-queue-item-id")
    })

    it("should return null for non-existent item", async () => {
      mockDocRef.get.mockResolvedValue({
        exists: false,
      })

      const result = await service.getQueueStatus("non-existent-id")

      expect(result).toBeNull()
    })
  })

  describe("getQueueStats", () => {
    it("should return queue statistics", async () => {
      // Mock snapshot with documents
      const mockDocs = [
        { data: () => ({ status: "pending" }) },
        { data: () => ({ status: "pending" }) },
        { data: () => ({ status: "processing" }) },
        { data: () => ({ status: "success" }) },
        { data: () => ({ status: "success" }) },
        { data: () => ({ status: "success" }) },
        { data: () => ({ status: "failed" }) },
      ]

      mockQueueCollection.get.mockResolvedValue({
        size: mockDocs.length,
        forEach: (callback: any) => mockDocs.forEach(callback),
      })

      const stats = await service.getQueueStats()

      expect(stats).toEqual({
        total: 7,
        pending: 2,
        processing: 1,
        success: 3,
        failed: 1,
        skipped: 0,
        filtered: 0,
      })
    })
  })

  describe("deleteQueueItem", () => {
    it("should delete a queue item", async () => {
      mockDocRef.delete.mockResolvedValue(undefined)

      await service.deleteQueueItem("test-queue-item-id")

      expect(mockQueueCollection.doc).toHaveBeenCalledWith("test-queue-item-id")
      expect(mockDocRef.delete).toHaveBeenCalled()
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Queue item deleted",
        expect.objectContaining({
          queueItemId: "test-queue-item-id",
        })
      )
    })

    it("should throw error on Firestore failure", async () => {
      const testError = new Error("Firestore error")
      mockDocRef.delete.mockRejectedValue(testError)

      await expect(service.deleteQueueItem("test-id")).rejects.toThrow("Firestore error")
      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to delete queue item",
        expect.objectContaining({
          error: testError,
        })
      )
    })
  })

  describe("getStopList", () => {
    it("should return stop list configuration", async () => {
      const mockStopList = {
        excludedCompanies: ["Bad Company"],
        excludedKeywords: ["bad", "scam"],
        excludedDomains: ["badcompany.com"],
      }

      mockDocRef.get.mockResolvedValue({
        exists: true,
        data: () => mockStopList,
      })

      const result = await service.getStopList()

      expect(result).toEqual(mockStopList)
    })

    it("should return empty arrays if stop list not found", async () => {
      mockDocRef.get.mockResolvedValue({
        exists: false,
      })

      const result = await service.getStopList()

      expect(result).toEqual({
        excludedCompanies: [],
        excludedKeywords: [],
        excludedDomains: [],
      })
    })
  })

  describe("getAISettings", () => {
    it("should return AI settings", async () => {
      const mockSettings = {
        provider: "claude",
        model: "claude-3-sonnet",
        minMatchScore: 70,
        costBudgetDaily: 50,
      }

      mockDocRef.get.mockResolvedValue({
        exists: true,
        data: () => mockSettings,
      })

      const result = await service.getAISettings()

      expect(result).toEqual(mockSettings)
    })
  })

  describe("getQueueSettings", () => {
    it("should return queue settings", async () => {
      const mockSettings = {
        maxRetries: 3,
        retryDelaySeconds: 300,
        processingTimeout: 3600,
      }

      mockDocRef.get.mockResolvedValue({
        exists: true,
        data: () => mockSettings,
      })

      const result = await service.getQueueSettings()

      expect(result).toEqual(mockSettings)
    })

    it("should return default settings if not found", async () => {
      mockDocRef.get.mockResolvedValue({
        exists: false,
      })

      const result = await service.getQueueSettings()

      expect(result).toEqual({
        maxRetries: 3,
        retryDelaySeconds: 300,
        processingTimeout: 3600,
      })
    })
  })
})
