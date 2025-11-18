/**
 * Firestore Service Error Handling Tests
 *
 * Tests to ensure FirestoreService handles errors gracefully
 * and prevents UI crashes/infinite loops
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { FirestoreService } from "../FirestoreService"
import { getDoc, getDocs } from "firebase/firestore"

// Mock Firebase
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  addDoc: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  query: vi.fn((...args) => args),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  startAfter: vi.fn(),
  startAt: vi.fn(),
  onSnapshot: vi.fn(),
  Timestamp: {
    now: () => ({ seconds: Date.now() / 1000, nanoseconds: 0 }),
    fromDate: (date: Date) => ({ seconds: date.getTime() / 1000, nanoseconds: 0 }),
  },
}))

vi.mock("@/config/firebase", () => ({
  db: {},
}))

describe("FirestoreService Error Handling", () => {
  let service: FirestoreService

  beforeEach(() => {
    service = new FirestoreService({} as any)
    vi.clearAllMocks()
  })

  describe("getDocument", () => {
    it("should return document data when it exists", async () => {
      vi.mocked(getDoc).mockResolvedValue({
        exists: () => true,
        id: "test-id",
        data: () => ({ name: "Test", value: 123 }),
      } as any)

      const result = await service.getDocument("content-items", "test-id")

      expect(result).toEqual({
        id: "test-id",
        name: "Test",
        value: 123,
      })
    })

    it("should return null when document does not exist", async () => {
      vi.mocked(getDoc).mockResolvedValue({
        exists: () => false,
      } as any)

      const result = await service.getDocument("content-items", "test-id")

      expect(result).toBeNull()
    })

    it("should return null on permission error without crashing", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
      vi.mocked(getDoc).mockRejectedValue(new Error("Missing or insufficient permissions"))

      // Should NOT throw - must return null to prevent UI crash
      const result = await service.getDocument("content-items", "test-id")

      expect(result).toBeNull()
      expect(consoleErrorSpy).toHaveBeenCalled()
      consoleErrorSpy.mockRestore()
    })

    it("should return null on network error without crashing", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
      vi.mocked(getDoc).mockRejectedValue(new Error("Network request failed"))

      // Should NOT throw - must return null to prevent UI crash
      const result = await service.getDocument("content-items", "test-id")

      expect(result).toBeNull()
      expect(consoleErrorSpy).toHaveBeenCalled()
      consoleErrorSpy.mockRestore()
    })

    it("should return null on any Firestore error", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
      vi.mocked(getDoc).mockRejectedValue(new Error("Firestore is unavailable"))

      // Should NOT throw - must return null to prevent UI crash
      const result = await service.getDocument("content-items", "test-id")

      expect(result).toBeNull()
      consoleErrorSpy.mockRestore()
    })

    it("should log error details for debugging", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
      const error = new Error("Test error")
      vi.mocked(getDoc).mockRejectedValue(error)

      await service.getDocument("content-items", "test-id")

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Error getting document"),
        error
      )
      consoleErrorSpy.mockRestore()
    })
  })

  describe("getDocuments", () => {
    it("should return array of documents when they exist", async () => {
      vi.mocked(getDocs).mockResolvedValue({
        docs: [
          {
            id: "doc1",
            data: () => ({ name: "Test 1" }),
          },
          {
            id: "doc2",
            data: () => ({ name: "Test 2" }),
          },
        ],
      } as any)

      const result = await service.getDocuments("content-items")

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({ id: "doc1", name: "Test 1" })
      expect(result[1]).toEqual({ id: "doc2", name: "Test 2" })
    })

    it("should return empty array when no documents exist", async () => {
      vi.mocked(getDocs).mockResolvedValue({
        docs: [],
      } as any)

      const result = await service.getDocuments("content-items")

      expect(result).toEqual([])
    })

    it("should return empty array on permission error without crashing", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
      vi.mocked(getDocs).mockRejectedValue(new Error("Missing or insufficient permissions"))

      // Should NOT throw - must return empty array to prevent UI crash
      const result = await service.getDocuments("content-items")

      expect(result).toEqual([])
      expect(consoleErrorSpy).toHaveBeenCalled()
      consoleErrorSpy.mockRestore()
    })

    it("should return empty array on network error without crashing", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
      vi.mocked(getDocs).mockRejectedValue(new Error("Network request failed"))

      // Should NOT throw - must return empty array to prevent UI crash
      const result = await service.getDocuments("content-items")

      expect(result).toEqual([])
      expect(consoleErrorSpy).toHaveBeenCalled()
      consoleErrorSpy.mockRestore()
    })

    it("should return empty array on any Firestore error", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
      vi.mocked(getDocs).mockRejectedValue(new Error("Firestore is unavailable"))

      // Should NOT throw - must return empty array to prevent UI crash
      const result = await service.getDocuments("content-items")

      expect(result).toEqual([])
      consoleErrorSpy.mockRestore()
    })

    it("should log error details for debugging", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
      const error = new Error("Test error")
      vi.mocked(getDocs).mockRejectedValue(error)

      await service.getDocuments("content-items")

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Error getting documents"),
        error
      )
      consoleErrorSpy.mockRestore()
    })

    it("should handle query constraints without errors", async () => {
      vi.mocked(getDocs).mockResolvedValue({
        docs: [],
      } as any)

      const result = await service.getDocuments("content-items", {
        where: [{ field: "status", operator: "==", value: "active" }],
        orderBy: [{ field: "createdAt", direction: "desc" }],
        limit: 10,
      })

      expect(result).toEqual([])
    })
  })

  describe("Error Prevention", () => {
    it("should never throw errors that could crash React components", async () => {
      const errors = [
        new Error("Permission denied"),
        new Error("Network offline"),
        new Error("Quota exceeded"),
        new Error("Invalid token"),
        new Error("Document not found"),
      ]

      for (const error of errors) {
        vi.mocked(getDoc).mockRejectedValue(error)

        // None of these should throw
        const result = await service.getDocument("content-items", "test-id")
        expect(result).toBeNull()
      }
    })

    it("should never cause infinite error loops", async () => {
      let callCount = 0
      vi.mocked(getDoc).mockImplementation(async () => {
        callCount++
        throw new Error("Persistent error")
      })

      // Call multiple times - should not trigger any retry logic
      await service.getDocument("content-items", "test-1")
      await service.getDocument("content-items", "test-2")
      await service.getDocument("content-items", "test-3")

      // Should only be called exactly 3 times (no retries)
      expect(callCount).toBe(3)
    })
  })
})
