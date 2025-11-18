/**
 * Tests for FirestoreService
 */

import { FirestoreService } from "../../services/firestore.service"
import { createMockLogger } from "../helpers/test-utils"

// Mock the firestore config
jest.mock("../../config/firestore", () => ({
  createFirestoreInstance: jest.fn(() => mockFirestore),
}))

// Create mock Firestore instance
const mockFirestore: any = {
  collection: jest.fn(),
}

describe("FirestoreService", () => {
  let service: FirestoreService
  let mockLogger: ReturnType<typeof createMockLogger>
  let mockCollection: any
  let mockDocRef: any

  beforeEach(() => {
    jest.clearAllMocks()

    // Reset mock Firestore
    mockDocRef = {
      id: "test-doc-id",
      get: jest.fn(),
      update: jest.fn(),
    }

    mockCollection = {
      add: jest.fn().mockResolvedValue(mockDocRef),
      doc: jest.fn().mockReturnValue(mockDocRef),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      get: jest.fn(),
    }

    mockFirestore.collection.mockReturnValue(mockCollection)

    mockLogger = createMockLogger()
    service = new FirestoreService(mockLogger)
  })

  describe("saveContactSubmission", () => {
    it("should save a contact submission and return document ID", async () => {
      const testData = {
        name: "John Doe",
        email: "john@example.com",
        message: "Test message",
        metadata: {
          timestamp: new Date().toISOString(),
          ip: "127.0.0.1",
          userAgent: "Test Agent",
        },
        requestId: "test-request-id",
        transaction: {
          contactEmail: {
            success: true,
            response: {
              messageId: "msg-123",
              accepted: true,
            },
          },
          autoReply: {
            success: true,
            response: {
              messageId: "msg-456",
              accepted: true,
            },
          },
          errors: [],
        },
      }

      const docId = await service.saveContactSubmission(testData)

      expect(docId).toBe("test-doc-id")
      expect(mockCollection.add).toHaveBeenCalledWith(
        expect.objectContaining({
          name: testData.name,
          email: testData.email,
          message: testData.message,
          status: "new",
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date),
        })
      )
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Contact submission saved to Firestore",
        expect.objectContaining({
          docId: "test-doc-id",
          requestId: testData.requestId,
        })
      )
    })

    it("should handle missing optional metadata fields", async () => {
      const testData = {
        name: "Jane Doe",
        email: "jane@example.com",
        message: "Test message",
        metadata: {
          timestamp: new Date().toISOString(),
        },
        requestId: "test-request-id",
        transaction: {
          contactEmail: {
            success: true,
          },
          autoReply: {
            success: true,
          },
          errors: [],
        },
      }

      await service.saveContactSubmission(testData)

      expect(mockCollection.add).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: {
            timestamp: testData.metadata.timestamp,
          },
        })
      )
    })

    it("should handle transaction errors", async () => {
      const testData = {
        name: "Test User",
        email: "test@example.com",
        message: "Test",
        metadata: {
          timestamp: new Date().toISOString(),
        },
        requestId: "test-request-id",
        transaction: {
          contactEmail: {
            success: false,
            error: "Failed to send",
            errorCode: "SEND_FAILED",
          },
          autoReply: {
            success: true,
          },
          errors: ["Failed to send contact email"],
        },
      }

      await service.saveContactSubmission(testData)

      expect(mockCollection.add).toHaveBeenCalledWith(
        expect.objectContaining({
          transaction: expect.objectContaining({
            contactEmail: expect.objectContaining({
              success: false,
              error: "Failed to send",
              errorCode: "SEND_FAILED",
            }),
            errors: ["Failed to send contact email"],
          }),
        })
      )
    })

    it("should throw and log error on Firestore failure", async () => {
      const testError = new Error("Firestore error")
      mockCollection.add.mockRejectedValue(testError)

      const testData = {
        name: "Test",
        email: "test@example.com",
        message: "Test",
        metadata: { timestamp: new Date().toISOString() },
        requestId: "test-request-id",
        transaction: {
          contactEmail: { success: true },
          autoReply: { success: true },
          errors: [],
        },
      }

      await expect(service.saveContactSubmission(testData)).rejects.toThrow("Firestore error")
      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to save contact submission to Firestore",
        expect.objectContaining({
          error: testError,
        })
      )
    })
  })

  describe("getSubmission", () => {
    it("should return submission when document exists", async () => {
      const testSubmission = {
        name: "John Doe",
        email: "john@example.com",
        message: "Test message",
        status: "new",
      }

      mockDocRef.get.mockResolvedValue({
        exists: true,
        data: () => testSubmission,
      })

      const result = await service.getSubmission("test-doc-id")

      expect(result).toEqual(testSubmission)
      expect(mockCollection.doc).toHaveBeenCalledWith("test-doc-id")
    })

    it("should return null when document does not exist", async () => {
      mockDocRef.get.mockResolvedValue({
        exists: false,
      })

      const result = await service.getSubmission("non-existent-id")

      expect(result).toBeNull()
    })

    it("should throw and log error on Firestore failure", async () => {
      const testError = new Error("Firestore error")
      mockDocRef.get.mockRejectedValue(testError)

      await expect(service.getSubmission("test-doc-id")).rejects.toThrow("Firestore error")
      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to get contact submission from Firestore",
        expect.objectContaining({
          error: testError,
          docId: "test-doc-id",
        })
      )
    })
  })

  describe("updateSubmissionStatus", () => {
    it("should update submission status", async () => {
      mockDocRef.update.mockResolvedValue(undefined)

      await service.updateSubmissionStatus("test-doc-id", "read")

      expect(mockCollection.doc).toHaveBeenCalledWith("test-doc-id")
      expect(mockDocRef.update).toHaveBeenCalledWith({
        status: "read",
        updatedAt: expect.any(Date),
      })
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Contact submission status updated",
        expect.objectContaining({
          docId: "test-doc-id",
          status: "read",
        })
      )
    })

    it("should throw and log error on Firestore failure", async () => {
      const testError = new Error("Firestore error")
      mockDocRef.update.mockRejectedValue(testError)

      await expect(service.updateSubmissionStatus("test-doc-id", "replied")).rejects.toThrow("Firestore error")
      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to update contact submission status",
        expect.objectContaining({
          error: testError,
          docId: "test-doc-id",
          status: "replied",
        })
      )
    })
  })

  describe("getRecentSubmissions", () => {
    it("should return recent submissions with default limit", async () => {
      const mockDocs = [
        {
          id: "doc-1",
          data: () => ({ name: "User 1", email: "user1@example.com" }),
        },
        {
          id: "doc-2",
          data: () => ({ name: "User 2", email: "user2@example.com" }),
        },
      ]

      mockCollection.get.mockResolvedValue({
        docs: mockDocs,
      })

      const result = await service.getRecentSubmissions()

      expect(mockCollection.orderBy).toHaveBeenCalledWith("createdAt", "desc")
      expect(mockCollection.limit).toHaveBeenCalledWith(50)
      expect(result).toEqual([
        { id: "doc-1", name: "User 1", email: "user1@example.com" },
        { id: "doc-2", name: "User 2", email: "user2@example.com" },
      ])
    })

    it("should accept custom limit", async () => {
      mockCollection.get.mockResolvedValue({ docs: [] })

      await service.getRecentSubmissions(10)

      expect(mockCollection.limit).toHaveBeenCalledWith(10)
    })

    it("should throw and log error on Firestore failure", async () => {
      const testError = new Error("Firestore error")
      mockCollection.get.mockRejectedValue(testError)

      await expect(service.getRecentSubmissions()).rejects.toThrow("Firestore error")
      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to get recent contact submissions",
        expect.objectContaining({
          error: testError,
        })
      )
    })
  })
})
