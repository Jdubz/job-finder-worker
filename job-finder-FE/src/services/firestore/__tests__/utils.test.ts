/**
 * Firestore Utils Tests
 */

import { describe, it, expect, vi } from "vitest"
import {
  convertTimestamps,
  safeFirestoreOperation,
  validateDocumentData,
  createUpdateMetadata,
  createDocumentMetadata,
} from "../utils"
import { Timestamp } from "firebase/firestore"

describe("Firestore Utils", () => {
  describe("convertTimestamps", () => {
    it("should convert top-level Timestamp to Date", () => {
      const mockTimestamp = {
        toDate: () => new Date("2024-01-01"),
      } as Timestamp

      const result = convertTimestamps<{ updatedAt: Date }>({ updatedAt: mockTimestamp })

      expect(result.updatedAt).toBeInstanceOf(Date)
      expect(result.updatedAt).toEqual(new Date("2024-01-01"))
    })

    it("should convert nested Timestamps", () => {
      const mockTimestamp = {
        toDate: () => new Date("2024-01-01"),
      } as Timestamp

      const result = convertTimestamps<{ nested: { timestamp: Date } }>({
        nested: {
          timestamp: mockTimestamp,
        },
      })

      expect(result.nested.timestamp).toBeInstanceOf(Date)
    })

    it("should convert Timestamps in arrays", () => {
      const mockTimestamp = {
        toDate: () => new Date("2024-01-01"),
      } as Timestamp

      const result = convertTimestamps<{ items: Array<{ timestamp: Date }> }>({
        items: [{ timestamp: mockTimestamp }],
      })

      expect(result.items[0].timestamp).toBeInstanceOf(Date)
    })

    it("should handle non-Timestamp values", () => {
      const result = convertTimestamps<{
        string: string
        number: number
        boolean: boolean
        null: null
      }>({
        string: "test",
        number: 123,
        boolean: true,
        null: null,
      })

      expect(result.string).toBe("test")
      expect(result.number).toBe(123)
      expect(result.boolean).toBe(true)
      expect(result.null).toBe(null)
    })
  })

  describe("safeFirestoreOperation", () => {
    it("should return operation result on success", async () => {
      const operation = async () => "success"
      const result = await safeFirestoreOperation(operation, "fallback")

      expect(result).toBe("success")
    })

    it("should return fallback on error", async () => {
      const operation = async () => {
        throw new Error("Test error")
      }
      const result = await safeFirestoreOperation(operation, "fallback")

      expect(result).toBe("fallback")
    })

    it("should log error on failure", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
      const operation = async () => {
        throw new Error("Test error")
      }

      await safeFirestoreOperation(operation, "fallback", "Test operation")

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Test operation failed, using fallback:",
        expect.any(Error)
      )
      consoleErrorSpy.mockRestore()
    })
  })

  describe("validateDocumentData", () => {
    it("should return true when all required fields exist", () => {
      const data = { field1: "value1", field2: "value2" }
      const result = validateDocumentData(data, ["field1", "field2"])

      expect(result).toBe(true)
    })

    it("should return false when required field is missing", () => {
      const data = { field1: "value1" }
      const result = validateDocumentData(data, ["field1", "field2"])

      expect(result).toBe(false)
    })

    it("should return false when required field is undefined", () => {
      const data = { field1: "value1", field2: undefined }
      const result = validateDocumentData(data, ["field1", "field2"])

      expect(result).toBe(false)
    })
  })

  describe("createUpdateMetadata", () => {
    it("should create metadata with updatedAt and updatedBy", () => {
      const metadata = createUpdateMetadata("test@example.com")

      expect(metadata.updatedAt).toBeInstanceOf(Date)
      expect(metadata.updatedBy).toBe("test@example.com")
    })
  })

  describe("createDocumentMetadata", () => {
    it("should create metadata with all creation fields", () => {
      const metadata = createDocumentMetadata("test@example.com")

      expect(metadata.createdAt).toBeInstanceOf(Date)
      expect(metadata.updatedAt).toBeInstanceOf(Date)
      expect(metadata.createdBy).toBe("test@example.com")
      expect(metadata.updatedBy).toBe("test@example.com")
    })

    it("should have same timestamp for createdAt and updatedAt", () => {
      const metadata = createDocumentMetadata("test@example.com")

      expect(metadata.createdAt.getTime()).toBe(metadata.updatedAt.getTime())
    })
  })
})
