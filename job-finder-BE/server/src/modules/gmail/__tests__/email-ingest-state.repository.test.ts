import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Mock the database before importing the repository
const mockDb = {
  prepare: vi.fn()
}

vi.mock("../../../db/sqlite", () => ({
  getDb: () => mockDb
}))

import { EmailIngestStateRepository } from "../email-ingest-state.repository"

describe("EmailIngestStateRepository", () => {
  let repo: EmailIngestStateRepository

  beforeEach(() => {
    vi.clearAllMocks()
    repo = new EmailIngestStateRepository()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe("findByMessageId", () => {
    it("should return null when message not found", () => {
      const mockGet = vi.fn().mockReturnValue(undefined)
      mockDb.prepare.mockReturnValue({ get: mockGet })

      const result = repo.findByMessageId("nonexistent-id")

      expect(result).toBeNull()
      expect(mockDb.prepare).toHaveBeenCalledWith("SELECT * FROM email_ingest_state WHERE message_id = ?")
      expect(mockGet).toHaveBeenCalledWith("nonexistent-id")
    })

    it("should return mapped record when message found", () => {
      const mockRow = {
        message_id: "msg-123",
        thread_id: "thread-456",
        gmail_email: "test@gmail.com",
        history_id: "hist-789",
        processed_at: "2025-01-01T00:00:00Z",
        jobs_found: 3,
        jobs_enqueued: 2,
        error: null
      }
      const mockGet = vi.fn().mockReturnValue(mockRow)
      mockDb.prepare.mockReturnValue({ get: mockGet })

      const result = repo.findByMessageId("msg-123")

      expect(result).toEqual({
        messageId: "msg-123",
        threadId: "thread-456",
        gmailEmail: "test@gmail.com",
        historyId: "hist-789",
        processedAt: "2025-01-01T00:00:00Z",
        jobsFound: 3,
        jobsEnqueued: 2,
        error: null
      })
    })
  })

  describe("isMessageProcessed", () => {
    it("should return false when message not found", () => {
      const mockGet = vi.fn().mockReturnValue(undefined)
      mockDb.prepare.mockReturnValue({ get: mockGet })

      const result = repo.isMessageProcessed("nonexistent-id")

      expect(result).toBe(false)
    })

    it("should return true when message exists", () => {
      const mockGet = vi.fn().mockReturnValue({ 1: 1 })
      mockDb.prepare.mockReturnValue({ get: mockGet })

      const result = repo.isMessageProcessed("existing-id")

      expect(result).toBe(true)
    })
  })

  describe("recordProcessed", () => {
    it("should insert or update a processed message record", () => {
      const mockRun = vi.fn()
      const mockGet = vi.fn().mockReturnValue({
        message_id: "msg-123",
        thread_id: "thread-456",
        gmail_email: "test@gmail.com",
        history_id: null,
        processed_at: "2025-01-01T00:00:00Z",
        jobs_found: 2,
        jobs_enqueued: 1,
        error: null
      })

      mockDb.prepare
        .mockReturnValueOnce({ run: mockRun })
        .mockReturnValueOnce({ get: mockGet })

      const result = repo.recordProcessed({
        messageId: "msg-123",
        threadId: "thread-456",
        gmailEmail: "test@gmail.com",
        jobsFound: 2,
        jobsEnqueued: 1
      })

      expect(mockRun).toHaveBeenCalled()
      expect(result.messageId).toBe("msg-123")
      expect(result.jobsFound).toBe(2)
      expect(result.jobsEnqueued).toBe(1)
    })

    it("should throw error when record not found after upsert", () => {
      const mockRun = vi.fn()
      const mockGet = vi.fn().mockReturnValue(undefined)

      mockDb.prepare
        .mockReturnValueOnce({ run: mockRun })
        .mockReturnValueOnce({ get: mockGet })

      expect(() =>
        repo.recordProcessed({
          messageId: "msg-missing",
          gmailEmail: "test@gmail.com",
          jobsFound: 0,
          jobsEnqueued: 0
        })
      ).toThrow("Failed to retrieve record for messageId msg-missing after upsert")
    })

    it("should handle error field", () => {
      const mockRun = vi.fn()
      const mockGet = vi.fn().mockReturnValue({
        message_id: "msg-error",
        thread_id: null,
        gmail_email: "test@gmail.com",
        history_id: null,
        processed_at: "2025-01-01T00:00:00Z",
        jobs_found: 0,
        jobs_enqueued: 0,
        error: "Parse failed"
      })

      mockDb.prepare
        .mockReturnValueOnce({ run: mockRun })
        .mockReturnValueOnce({ get: mockGet })

      const result = repo.recordProcessed({
        messageId: "msg-error",
        gmailEmail: "test@gmail.com",
        jobsFound: 0,
        jobsEnqueued: 0,
        error: "Parse failed"
      })

      expect(result.error).toBe("Parse failed")
    })
  })

  describe("getLastSyncTime", () => {
    it("should return null when no records exist", () => {
      const mockGet = vi.fn().mockReturnValue({ last_sync: null })
      mockDb.prepare.mockReturnValue({ get: mockGet })

      const result = repo.getLastSyncTime()

      expect(result).toBeNull()
    })

    it("should return last sync time when records exist", () => {
      const mockGet = vi.fn().mockReturnValue({ last_sync: "2025-01-01T12:00:00Z" })
      mockDb.prepare.mockReturnValue({ get: mockGet })

      const result = repo.getLastSyncTime()

      expect(result).toBe("2025-01-01T12:00:00Z")
    })

    it("should filter by gmail email when provided", () => {
      const mockGet = vi.fn().mockReturnValue({ last_sync: "2025-01-01T12:00:00Z" })
      mockDb.prepare.mockReturnValue({ get: mockGet })

      const result = repo.getLastSyncTime("specific@gmail.com")

      // Verify prepare was called with the filtered query
      expect(mockDb.prepare).toHaveBeenCalledWith(
        "SELECT MAX(processed_at) as last_sync FROM email_ingest_state WHERE gmail_email = ?"
      )
      expect(result).toBe("2025-01-01T12:00:00Z")
    })
  })

  describe("getStats", () => {
    it("should return zeros when no records exist", () => {
      const mockGet = vi.fn().mockReturnValue({ total: 0, found: null, enqueued: null })
      mockDb.prepare.mockReturnValue({ get: mockGet })

      const result = repo.getStats()

      expect(result).toEqual({
        totalProcessed: 0,
        totalJobsFound: 0,
        totalJobsEnqueued: 0
      })
    })

    it("should return aggregated stats", () => {
      const mockGet = vi.fn().mockReturnValue({ total: 100, found: 250, enqueued: 200 })
      mockDb.prepare.mockReturnValue({ get: mockGet })

      const result = repo.getStats()

      expect(result).toEqual({
        totalProcessed: 100,
        totalJobsFound: 250,
        totalJobsEnqueued: 200
      })
    })
  })

  describe("pruneOlderThan", () => {
    it("should delete records older than specified days", () => {
      const mockRun = vi.fn().mockReturnValue({ changes: 15 })
      mockDb.prepare.mockReturnValue({ run: mockRun })

      const result = repo.pruneOlderThan(30)

      expect(result).toBe(15)
      expect(mockDb.prepare).toHaveBeenCalledWith(
        "DELETE FROM email_ingest_state WHERE processed_at < ?"
      )
    })
  })
})
