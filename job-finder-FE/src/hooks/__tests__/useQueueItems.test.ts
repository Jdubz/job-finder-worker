/**
 * Queue Items Hook Tests
 *
 * Tests for queue items management hook including:
 * - Queue item fetching with real-time updates
 * - Status filtering
 * - Update and delete operations
 * - Error handling
 * - Authorization for editors
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { useQueueItems } from "../useQueueItems"
import { useAuth } from "@/contexts/AuthContext"
import { useFirestore } from "@/contexts/FirestoreContext"
import { useFirestoreCollection } from "../useFirestoreCollection"

// Mock dependencies
vi.mock("@/contexts/AuthContext")
vi.mock("@/contexts/FirestoreContext")
vi.mock("../useFirestoreCollection")

describe("useQueueItems Hook", () => {
  const mockUser = {
    uid: "test-user-123",
    email: "test@example.com",
    displayName: "Test User",
  }

  const mockQueueItems = [
    {
      id: "queue-1",
      job_match_id: "match-1",
      job_title: "Software Engineer",
      company: "Tech Corp",
      status: "pending",
      created_at: new Date("2024-01-15T10:00:00Z"),
      submitted_by: "user-1",
    },
    {
      id: "queue-2",
      job_match_id: "match-2",
      job_title: "Senior Developer",
      company: "StartupCo",
      status: "processing",
      created_at: new Date("2024-01-14T10:00:00Z"),
      submitted_by: "user-2",
    },
    {
      id: "queue-3",
      job_match_id: "match-3",
      job_title: "Full Stack Engineer",
      company: "BigCorp",
      status: "success",
      created_at: new Date("2024-01-13T10:00:00Z"),
      submitted_by: "user-1",
    },
    {
      id: "queue-4",
      job_match_id: "match-4",
      job_title: "Backend Developer",
      company: "DevShop",
      status: "failed",
      created_at: new Date("2024-01-12T10:00:00Z"),
      error_message: "Generation failed",
      submitted_by: "user-3",
    },
  ]

  const mockUpdateDocument = vi.fn()
  const mockDeleteDocument = vi.fn()
  const mockRefetch = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(useAuth).mockReturnValue({
      user: mockUser as any,
      loading: false,
      signOut: vi.fn(),
      signInWithGoogle: vi.fn(),
    } as any)

    vi.mocked(useFirestore).mockReturnValue({
      service: {
        updateDocument: mockUpdateDocument,
        deleteDocument: mockDeleteDocument,
      } as any,
    } as any)

    vi.mocked(useFirestoreCollection).mockReturnValue({
      data: mockQueueItems as any,
      loading: false,
      error: null,
      refetch: mockRefetch,
    })
  })

  describe("Initial Hook Behavior", () => {
    it("should return queue items", () => {
      const { result } = renderHook(() => useQueueItems())

      expect(result.current.queueItems).toEqual(mockQueueItems)
      expect(result.current.loading).toBe(false)
      expect(result.current.error).toBeNull()
    })

    it("should show loading state", () => {
      vi.mocked(useFirestoreCollection).mockReturnValue({
        data: [],
        loading: true,
        error: null,
        refetch: mockRefetch,
      })

      const { result } = renderHook(() => useQueueItems())

      expect(result.current.loading).toBe(true)
      expect(result.current.queueItems).toEqual([])
    })

    it("should handle errors", () => {
      const mockError = new Error("Failed to fetch queue items")
      vi.mocked(useFirestoreCollection).mockReturnValue({
        data: [],
        loading: false,
        error: mockError,
        refetch: mockRefetch,
      })

      const { result } = renderHook(() => useQueueItems())

      expect(result.current.error).toBe(mockError)
      expect(result.current.queueItems).toEqual([])
    })

    it("should not fetch when user is not authenticated", () => {
      vi.mocked(useAuth).mockReturnValue({
        user: null,
        loading: false,
        signOut: vi.fn(),
        signInWithGoogle: vi.fn(),
      } as any)

      renderHook(() => useQueueItems())

      expect(useFirestoreCollection).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: false,
        })
      )
    })
  })

  describe("Query Configuration", () => {
    it("should query job-queue collection", () => {
      renderHook(() => useQueueItems())

      expect(useFirestoreCollection).toHaveBeenCalledWith(
        expect.objectContaining({
          collectionName: "job-queue",
        })
      )
    })

    it("should show all queue items for editors (no userId filter)", () => {
      renderHook(() => useQueueItems())

      const callArgs = vi.mocked(useFirestoreCollection).mock.calls[0][0]

      // Should NOT filter by submitted_by
      expect(callArgs.constraints?.where || []).not.toContainEqual(
        expect.objectContaining({ field: "submitted_by" })
      )
    })

    it("should order by creation date descending", () => {
      renderHook(() => useQueueItems())

      const callArgs = vi.mocked(useFirestoreCollection).mock.calls[0][0]

      expect(callArgs.constraints?.orderBy).toEqual([{ field: "created_at", direction: "desc" }])
    })

    it("should apply default limit of 50", () => {
      renderHook(() => useQueueItems())

      const callArgs = vi.mocked(useFirestoreCollection).mock.calls[0][0]

      expect(callArgs.constraints?.limit).toBe(50)
    })

    it("should apply custom limit", () => {
      renderHook(() => useQueueItems({ limit: 100 }))

      const callArgs = vi.mocked(useFirestoreCollection).mock.calls[0][0]

      expect(callArgs.constraints?.limit).toBe(100)
    })
  })

  describe("Status Filtering", () => {
    it("should filter by pending status", () => {
      renderHook(() => useQueueItems({ status: "pending" }))

      const callArgs = vi.mocked(useFirestoreCollection).mock.calls[0][0]

      expect(callArgs.constraints?.where).toContainEqual({
        field: "status",
        operator: "==",
        value: "pending",
      })
    })

    it("should filter by processing status", () => {
      renderHook(() => useQueueItems({ status: "processing" }))

      const callArgs = vi.mocked(useFirestoreCollection).mock.calls[0][0]

      expect(callArgs.constraints?.where).toContainEqual({
        field: "status",
        operator: "==",
        value: "processing",
      })
    })

    it("should filter by success status", () => {
      renderHook(() => useQueueItems({ status: "success" }))

      const callArgs = vi.mocked(useFirestoreCollection).mock.calls[0][0]

      expect(callArgs.constraints?.where).toContainEqual({
        field: "status",
        operator: "==",
        value: "success",
      })
    })

    it("should filter by failed status", () => {
      renderHook(() => useQueueItems({ status: "failed" }))

      const callArgs = vi.mocked(useFirestoreCollection).mock.calls[0][0]

      expect(callArgs.constraints?.where).toContainEqual({
        field: "status",
        operator: "==",
        value: "failed",
      })
    })

    it("should not filter when status is not provided", () => {
      renderHook(() => useQueueItems())

      const callArgs = vi.mocked(useFirestoreCollection).mock.calls[0][0]

      expect(callArgs.constraints?.where || []).toHaveLength(0)
    })
  })

  describe("Update Queue Item", () => {
    it("should update queue item status", async () => {
      mockUpdateDocument.mockResolvedValue(undefined)
      const { result } = renderHook(() => useQueueItems())

      await result.current.updateQueueItem("queue-1", { status: "processing" })

      expect(mockUpdateDocument).toHaveBeenCalledWith("job-queue", "queue-1", {
        status: "processing",
      })
    })

    it("should update queue item with error message", async () => {
      mockUpdateDocument.mockResolvedValue(undefined)
      const { result } = renderHook(() => useQueueItems())

      await result.current.updateQueueItem("queue-1", {
        status: "failed",
        error_details: "Generation failed",
      })

      expect(mockUpdateDocument).toHaveBeenCalledWith("job-queue", "queue-1", {
        status: "failed",
        error_details: "Generation failed",
      })
    })

    it("should handle update errors", async () => {
      mockUpdateDocument.mockRejectedValue(new Error("Update failed"))
      const { result } = renderHook(() => useQueueItems())

      await expect(
        result.current.updateQueueItem("queue-1", { status: "processing" })
      ).rejects.toThrow("Update failed")
    })

    it("should update multiple fields", async () => {
      mockUpdateDocument.mockResolvedValue(undefined)
      const { result } = renderHook(() => useQueueItems())

      const updates = {
        status: "success" as const,
        completed_at: new Date(),
        result_id: "result-123",
      }

      await result.current.updateQueueItem("queue-1", updates)

      expect(mockUpdateDocument).toHaveBeenCalledWith("job-queue", "queue-1", updates)
    })
  })

  describe("Delete Queue Item", () => {
    it("should delete a queue item", async () => {
      mockDeleteDocument.mockResolvedValue(undefined)
      const { result } = renderHook(() => useQueueItems())

      await result.current.deleteQueueItem("queue-1")

      expect(mockDeleteDocument).toHaveBeenCalledWith("job-queue", "queue-1")
    })

    it("should handle delete errors", async () => {
      mockDeleteDocument.mockRejectedValue(new Error("Delete failed"))
      const { result } = renderHook(() => useQueueItems())

      await expect(result.current.deleteQueueItem("queue-1")).rejects.toThrow("Delete failed")
    })

    it("should delete item by ID", async () => {
      mockDeleteDocument.mockResolvedValue(undefined)
      const { result } = renderHook(() => useQueueItems())

      await result.current.deleteQueueItem("queue-999")

      expect(mockDeleteDocument).toHaveBeenCalledWith("job-queue", "queue-999")
    })
  })

  describe("Refetch", () => {
    it("should refetch queue items", async () => {
      mockRefetch.mockResolvedValue(undefined)
      const { result } = renderHook(() => useQueueItems())

      await result.current.refetch()

      expect(mockRefetch).toHaveBeenCalled()
    })

    it("should handle refetch errors", async () => {
      mockRefetch.mockRejectedValue(new Error("Refetch failed"))
      const { result } = renderHook(() => useQueueItems())

      await expect(result.current.refetch()).rejects.toThrow("Refetch failed")
    })
  })

  describe("Real-time Updates", () => {
    it("should update when new items are added", async () => {
      const { result, rerender } = renderHook(() => useQueueItems())

      const newItem = {
        id: "queue-5",
        job_match_id: "match-5",
        job_title: "DevOps Engineer",
        company: "CloudCo",
        status: "pending",
        created_at: new Date(),
        submitted_by: "user-4",
      }

      vi.mocked(useFirestoreCollection).mockReturnValue({
        data: [...mockQueueItems, newItem] as any,
        loading: false,
        error: null,
        refetch: mockRefetch,
      })

      rerender()

      await waitFor(() => {
        expect(result.current.queueItems).toHaveLength(5)
        expect(result.current.queueItems[4].id).toBe("queue-5")
      })
    })

    it("should update when items are removed", async () => {
      const { result, rerender } = renderHook(() => useQueueItems())

      vi.mocked(useFirestoreCollection).mockReturnValue({
        data: mockQueueItems.slice(1) as any,
        loading: false,
        error: null,
        refetch: mockRefetch,
      })

      rerender()

      await waitFor(() => {
        expect(result.current.queueItems).toHaveLength(3)
        expect(result.current.queueItems.find((item) => item.id === "queue-1")).toBeUndefined()
      })
    })

    it("should update when item status changes", async () => {
      const { result, rerender } = renderHook(() => useQueueItems())

      const updatedItems = mockQueueItems.map((item) =>
        item.id === "queue-1" ? { ...item, status: "processing" } : item
      )

      vi.mocked(useFirestoreCollection).mockReturnValue({
        data: updatedItems as any,
        loading: false,
        error: null,
        refetch: mockRefetch,
      })

      rerender()

      await waitFor(() => {
        const item = result.current.queueItems.find((i) => i.id === "queue-1")
        expect(item?.status).toBe("processing")
      })
    })
  })

  describe("Function Stability", () => {
    it("should have stable update function reference", () => {
      const { result, rerender } = renderHook(() => useQueueItems())

      const firstUpdate = result.current.updateQueueItem
      rerender()
      const secondUpdate = result.current.updateQueueItem

      expect(firstUpdate).toBe(secondUpdate)
    })

    it("should have stable delete function reference", () => {
      const { result, rerender } = renderHook(() => useQueueItems())

      const firstDelete = result.current.deleteQueueItem
      rerender()
      const secondDelete = result.current.deleteQueueItem

      expect(firstDelete).toBe(secondDelete)
    })

    it("should have stable refetch function reference", () => {
      const { result, rerender } = renderHook(() => useQueueItems())

      const firstRefetch = result.current.refetch
      rerender()
      const secondRefetch = result.current.refetch

      expect(firstRefetch).toBe(secondRefetch)
    })
  })

  describe("Edge Cases", () => {
    it("should handle empty queue", () => {
      vi.mocked(useFirestoreCollection).mockReturnValue({
        data: [],
        loading: false,
        error: null,
        refetch: mockRefetch,
      })

      const { result } = renderHook(() => useQueueItems())

      expect(result.current.queueItems).toEqual([])
      expect(result.current.loading).toBe(false)
      expect(result.current.error).toBeNull()
    })

    it("should handle queue with only one status", () => {
      const pendingOnly = mockQueueItems.filter((item) => item.status === "pending")

      vi.mocked(useFirestoreCollection).mockReturnValue({
        data: pendingOnly as any,
        loading: false,
        error: null,
        refetch: mockRefetch,
      })

      const { result } = renderHook(() => useQueueItems({ status: "pending" }))

      expect(result.current.queueItems).toHaveLength(1)
      expect(result.current.queueItems[0].status).toBe("pending")
    })

    it("should handle very large queue", () => {
      const largeQueue = Array.from({ length: 1000 }, (_, i) => ({
        id: `queue-${i}`,
        job_match_id: `match-${i}`,
        job_title: `Job ${i}`,
        company: `Company ${i}`,
        status: "pending",
        created_at: new Date(),
        submitted_by: `user-${i}`,
      }))

      vi.mocked(useFirestoreCollection).mockReturnValue({
        data: largeQueue.slice(0, 50) as any,
        loading: false,
        error: null,
        refetch: mockRefetch,
      })

      const { result } = renderHook(() => useQueueItems({ limit: 50 }))

      expect(result.current.queueItems).toHaveLength(50)
    })

    it("should handle items with missing fields", () => {
      const incompleteItem = {
        id: "incomplete-1",
        status: "pending",
        created_at: new Date(),
      }

      vi.mocked(useFirestoreCollection).mockReturnValue({
        data: [incompleteItem] as any,
        loading: false,
        error: null,
        refetch: mockRefetch,
      })

      const { result } = renderHook(() => useQueueItems())

      expect(result.current.queueItems).toHaveLength(1)
      expect(result.current.queueItems[0].id).toBe("incomplete-1")
    })
  })

  describe("Authorization", () => {
    it("should allow editors to see all queue items", () => {
      const editorUser = { ...mockUser, role: "editor" }
      vi.mocked(useAuth).mockReturnValue({
        user: editorUser as any,
        loading: false,
        signOut: vi.fn(),
        signInWithGoogle: vi.fn(),
      } as any)

      renderHook(() => useQueueItems())

      const callArgs = vi.mocked(useFirestoreCollection).mock.calls[0][0]

      // Should NOT have submitted_by filter
      expect(callArgs.constraints?.where || []).not.toContainEqual(
        expect.objectContaining({ field: "submitted_by" })
      )
    })

    it("should allow any authenticated user to see all items", () => {
      renderHook(() => useQueueItems())

      expect(vi.mocked(useFirestoreCollection)).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: true,
        })
      )
    })
  })
})
