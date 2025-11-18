/**
 * Generator Documents Hook Tests
 *
 * Tests for generator documents management hook including:
 * - Document fetching with transformation
 * - Real-time updates
 * - Document deletion
 * - Date handling
 * - Type transformations
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { useGeneratorDocuments } from "../useGeneratorDocuments"
import { useAuth } from "@/contexts/AuthContext"
import { useFirestore } from "@/contexts/FirestoreContext"
import { useFirestoreCollection } from "../useFirestoreCollection"

// Mock dependencies
vi.mock("@/contexts/AuthContext")
vi.mock("@/contexts/FirestoreContext")
vi.mock("../useFirestoreCollection")

describe("useGeneratorDocuments Hook", () => {
  const mockUser = {
    uid: "test-user-123",
    email: "test@example.com",
    displayName: "Test User",
  }

  const mockRawDocuments = [
    {
      id: "doc-1",
      type: "request",
      generateType: "resume",
      job: {
        role: "Software Engineer",
        company: "Tech Corp",
        description: "Great job",
      },
      files: {
        resume: {
          signedUrl: "https://storage.example.com/resume1.pdf",
          path: "resumes/resume1.pdf",
        },
      },
      status: "completed",
      createdAt: new Date("2024-01-15T10:00:00Z"),
      jobMatchId: "match-1",
    },
    {
      id: "doc-2",
      type: "request",
      generateType: "coverLetter",
      job: {
        role: "Senior Developer",
        company: "StartupCo",
        description: "Exciting startup",
      },
      files: {
        coverLetter: {
          signedUrl: "https://storage.example.com/cover1.pdf",
          path: "covers/cover1.pdf",
        },
      },
      status: "completed",
      createdAt: { seconds: 1705226400, nanoseconds: 0 },
      jobMatchId: "match-2",
    },
    {
      id: "doc-3",
      type: "request",
      generateType: "both",
      job: {
        role: "Full Stack Engineer",
        company: "BigCorp",
        description: "Full stack role",
      },
      files: {
        resume: {
          signedUrl: "https://storage.example.com/resume2.pdf",
          path: "resumes/resume2.pdf",
        },
        coverLetter: {
          signedUrl: "https://storage.example.com/cover2.pdf",
          path: "covers/cover2.pdf",
        },
      },
      status: "completed",
      createdAt: "2024-01-13T10:00:00Z",
    },
    {
      id: "doc-4",
      type: "request",
      generateType: "resume",
      job: {
        role: "Backend Developer",
        company: "DevShop",
        description: "Backend focused",
      },
      status: "failed",
      createdAt: 1705053600000,
      jobMatchId: "match-4",
    },
  ]

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
        deleteDocument: mockDeleteDocument,
      } as any,
    } as any)

    vi.mocked(useFirestoreCollection).mockReturnValue({
      data: mockRawDocuments as any,
      loading: false,
      error: null,
      refetch: mockRefetch,
    })
  })

  describe("Initial Hook Behavior", () => {
    it("should return transformed documents", () => {
      const { result } = renderHook(() => useGeneratorDocuments())

      expect(result.current.documents).toHaveLength(4)
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

      const { result } = renderHook(() => useGeneratorDocuments())

      expect(result.current.loading).toBe(true)
      expect(result.current.documents).toEqual([])
    })

    it("should handle errors", () => {
      const mockError = new Error("Failed to fetch documents")
      vi.mocked(useFirestoreCollection).mockReturnValue({
        data: [],
        loading: false,
        error: mockError,
        refetch: mockRefetch,
      })

      const { result } = renderHook(() => useGeneratorDocuments())

      expect(result.current.error).toBe(mockError)
      expect(result.current.documents).toEqual([])
    })

    it("should not fetch when user is not authenticated", () => {
      vi.mocked(useAuth).mockReturnValue({
        user: null,
        loading: false,
        signOut: vi.fn(),
        signInWithGoogle: vi.fn(),
      } as any)

      renderHook(() => useGeneratorDocuments())

      expect(useFirestoreCollection).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: false,
        })
      )
    })
  })

  describe("Query Configuration", () => {
    it("should query generator-documents collection", () => {
      renderHook(() => useGeneratorDocuments())

      expect(useFirestoreCollection).toHaveBeenCalledWith(
        expect.objectContaining({
          collectionName: "generator-documents",
        })
      )
    })

    it("should order by createdAt descending", () => {
      renderHook(() => useGeneratorDocuments())

      const callArgs = vi.mocked(useFirestoreCollection).mock.calls[0][0]

      expect(callArgs.constraints?.orderBy).toEqual([{ field: "createdAt", direction: "desc" }])
    })

    it("should not filter by userId (editors see all)", () => {
      renderHook(() => useGeneratorDocuments())

      const callArgs = vi.mocked(useFirestoreCollection).mock.calls[0][0]

      // Should NOT have userId or submitted_by filter
      expect(callArgs.constraints?.where || []).toHaveLength(0)
    })

    it("should enable query when user is authenticated", () => {
      renderHook(() => useGeneratorDocuments())

      expect(useFirestoreCollection).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: true,
        })
      )
    })
  })

  describe("Document Transformation", () => {
    it("should transform resume documents correctly", () => {
      const { result } = renderHook(() => useGeneratorDocuments())

      const resumeDoc = result.current.documents.find((d) => d.id === "doc-1")

      expect(resumeDoc).toEqual({
        id: "doc-1",
        type: "resume",
        jobTitle: "Software Engineer",
        companyName: "Tech Corp",
        documentUrl: "https://storage.example.com/resume1.pdf",
        status: "completed",
        createdAt: expect.any(Date),
        jobMatchId: "match-1",
      })
    })

    it("should transform cover letter documents correctly", () => {
      const { result } = renderHook(() => useGeneratorDocuments())

      const coverDoc = result.current.documents.find((d) => d.id === "doc-2")

      expect(coverDoc).toEqual({
        id: "doc-2",
        type: "cover_letter",
        jobTitle: "Senior Developer",
        companyName: "StartupCo",
        documentUrl: "https://storage.example.com/cover1.pdf",
        status: "completed",
        createdAt: expect.any(Date),
        jobMatchId: "match-2",
      })
    })

    it("should transform both type documents correctly", () => {
      const { result } = renderHook(() => useGeneratorDocuments())

      const bothDoc = result.current.documents.find((d) => d.id === "doc-3")

      expect(bothDoc?.type).toBe("both")
      expect(bothDoc?.documentUrl).toBe("https://storage.example.com/resume2.pdf")
    })

    it("should handle documents without files", () => {
      const { result } = renderHook(() => useGeneratorDocuments())

      const failedDoc = result.current.documents.find((d) => d.id === "doc-4")

      expect(failedDoc?.documentUrl).toBeUndefined()
      expect(failedDoc?.status).toBe("failed")
    })

    it("should extract job title and company", () => {
      const { result } = renderHook(() => useGeneratorDocuments())

      result.current.documents.forEach((doc) => {
        expect(doc.jobTitle).toBeTruthy()
        expect(doc.companyName).toBeTruthy()
      })
    })

    it("should include jobMatchId when present", () => {
      const { result } = renderHook(() => useGeneratorDocuments())

      const docWithMatch = result.current.documents.find((d) => d.id === "doc-1")
      expect(docWithMatch?.jobMatchId).toBe("match-1")
    })

    it("should handle missing jobMatchId", () => {
      const { result } = renderHook(() => useGeneratorDocuments())

      const docWithoutMatch = result.current.documents.find((d) => d.id === "doc-3")
      expect(docWithoutMatch?.jobMatchId).toBeUndefined()
    })
  })

  describe("Date Handling", () => {
    it("should handle Date objects", () => {
      const { result } = renderHook(() => useGeneratorDocuments())

      const doc = result.current.documents.find((d) => d.id === "doc-1")

      expect(doc?.createdAt).toBeInstanceOf(Date)
      expect(doc?.createdAt.toISOString()).toBe("2024-01-15T10:00:00.000Z")
    })

    it("should handle Firestore Timestamp objects", () => {
      const { result } = renderHook(() => useGeneratorDocuments())

      const doc = result.current.documents.find((d) => d.id === "doc-2")

      expect(doc?.createdAt).toBeInstanceOf(Date)
      // Timestamp with seconds: 1705226400
      expect(doc?.createdAt.getTime()).toBe(1705226400000)
    })

    it("should handle ISO string dates", () => {
      const { result } = renderHook(() => useGeneratorDocuments())

      const doc = result.current.documents.find((d) => d.id === "doc-3")

      expect(doc?.createdAt).toBeInstanceOf(Date)
      expect(doc?.createdAt.toISOString()).toBe("2024-01-13T10:00:00.000Z")
    })

    it("should handle numeric timestamps", () => {
      const { result } = renderHook(() => useGeneratorDocuments())

      const doc = result.current.documents.find((d) => d.id === "doc-4")

      expect(doc?.createdAt).toBeInstanceOf(Date)
      expect(doc?.createdAt.getTime()).toBe(1705053600000)
    })
  })

  describe("Document Type Mapping", () => {
    it("should map resume generateType to resume type", () => {
      const { result } = renderHook(() => useGeneratorDocuments())

      const doc = result.current.documents.find((d) => d.id === "doc-1")
      expect(doc?.type).toBe("resume")
    })

    it("should map coverLetter generateType to cover_letter type", () => {
      const { result } = renderHook(() => useGeneratorDocuments())

      const doc = result.current.documents.find((d) => d.id === "doc-2")
      expect(doc?.type).toBe("cover_letter")
    })

    it("should map both generateType to both type", () => {
      const { result } = renderHook(() => useGeneratorDocuments())

      const doc = result.current.documents.find((d) => d.id === "doc-3")
      expect(doc?.type).toBe("both")
    })
  })

  describe("Document URL Selection", () => {
    it("should prefer resume URL for resume documents", () => {
      const { result } = renderHook(() => useGeneratorDocuments())

      const doc = result.current.documents.find((d) => d.id === "doc-1")
      expect(doc?.documentUrl).toBe("https://storage.example.com/resume1.pdf")
    })

    it("should use cover letter URL for cover letter documents", () => {
      const { result } = renderHook(() => useGeneratorDocuments())

      const doc = result.current.documents.find((d) => d.id === "doc-2")
      expect(doc?.documentUrl).toBe("https://storage.example.com/cover1.pdf")
    })

    it("should prefer resume URL when both are present", () => {
      const { result } = renderHook(() => useGeneratorDocuments())

      const doc = result.current.documents.find((d) => d.id === "doc-3")
      expect(doc?.documentUrl).toBe("https://storage.example.com/resume2.pdf")
    })

    it("should handle missing URLs gracefully", () => {
      const { result } = renderHook(() => useGeneratorDocuments())

      const doc = result.current.documents.find((d) => d.id === "doc-4")
      expect(doc?.documentUrl).toBeUndefined()
    })
  })

  describe("Delete Document", () => {
    it("should delete a document", async () => {
      mockDeleteDocument.mockResolvedValue(undefined)
      const { result } = renderHook(() => useGeneratorDocuments())

      await result.current.deleteDocument("doc-1")

      expect(mockDeleteDocument).toHaveBeenCalledWith("generator-documents", "doc-1")
    })

    it("should handle delete errors", async () => {
      mockDeleteDocument.mockRejectedValue(new Error("Delete failed"))
      const { result } = renderHook(() => useGeneratorDocuments())

      await expect(result.current.deleteDocument("doc-1")).rejects.toThrow("Delete failed")
    })

    it("should delete document by ID", async () => {
      mockDeleteDocument.mockResolvedValue(undefined)
      const { result } = renderHook(() => useGeneratorDocuments())

      await result.current.deleteDocument("doc-999")

      expect(mockDeleteDocument).toHaveBeenCalledWith("generator-documents", "doc-999")
    })
  })

  describe("Refetch", () => {
    it("should refetch documents", async () => {
      mockRefetch.mockResolvedValue(undefined)
      const { result } = renderHook(() => useGeneratorDocuments())

      await result.current.refetch()

      expect(mockRefetch).toHaveBeenCalled()
    })

    it("should handle refetch errors", async () => {
      mockRefetch.mockRejectedValue(new Error("Refetch failed"))
      const { result } = renderHook(() => useGeneratorDocuments())

      await expect(result.current.refetch()).rejects.toThrow("Refetch failed")
    })
  })

  describe("Real-time Updates", () => {
    it("should update when new documents are added", async () => {
      const { result, rerender } = renderHook(() => useGeneratorDocuments())

      const newDoc = {
        id: "doc-5",
        type: "request",
        generateType: "resume",
        job: {
          role: "DevOps Engineer",
          company: "CloudCo",
          description: "Cloud infrastructure",
        },
        status: "pending",
        createdAt: new Date(),
      }

      vi.mocked(useFirestoreCollection).mockReturnValue({
        data: [...mockRawDocuments, newDoc] as any,
        loading: false,
        error: null,
        refetch: mockRefetch,
      })

      rerender()

      await waitFor(() => {
        expect(result.current.documents).toHaveLength(5)
        expect(result.current.documents[4].id).toBe("doc-5")
      })
    })

    it("should update when documents are removed", async () => {
      const { result, rerender } = renderHook(() => useGeneratorDocuments())

      vi.mocked(useFirestoreCollection).mockReturnValue({
        data: mockRawDocuments.slice(1) as any,
        loading: false,
        error: null,
        refetch: mockRefetch,
      })

      rerender()

      await waitFor(() => {
        expect(result.current.documents).toHaveLength(3)
        expect(result.current.documents.find((d) => d.id === "doc-1")).toBeUndefined()
      })
    })

    it("should update when document status changes", async () => {
      const { result, rerender } = renderHook(() => useGeneratorDocuments())

      const updatedDocs = mockRawDocuments.map((doc) =>
        doc.id === "doc-4"
          ? { ...doc, status: "completed", files: { resume: { signedUrl: "test.pdf" } } }
          : doc
      )

      vi.mocked(useFirestoreCollection).mockReturnValue({
        data: updatedDocs as any,
        loading: false,
        error: null,
        refetch: mockRefetch,
      })

      rerender()

      await waitFor(() => {
        const doc = result.current.documents.find((d) => d.id === "doc-4")
        expect(doc?.status).toBe("completed")
        expect(doc?.documentUrl).toBe("test.pdf")
      })
    })
  })

  describe("Function Stability", () => {
    it("should have stable delete function reference", () => {
      const { result, rerender } = renderHook(() => useGeneratorDocuments())

      const firstDelete = result.current.deleteDocument
      rerender()
      const secondDelete = result.current.deleteDocument

      expect(firstDelete).toBe(secondDelete)
    })

    it("should have stable refetch function reference", () => {
      const { result, rerender } = renderHook(() => useGeneratorDocuments())

      const firstRefetch = result.current.refetch
      rerender()
      const secondRefetch = result.current.refetch

      expect(firstRefetch).toBe(secondRefetch)
    })
  })

  describe("Memoization", () => {
    it("should memoize transformed documents", () => {
      const { result, rerender } = renderHook(() => useGeneratorDocuments())

      const firstDocs = result.current.documents
      rerender()
      const secondDocs = result.current.documents

      expect(firstDocs).toBe(secondDocs)
    })

    it("should update when raw documents change", async () => {
      const { result, rerender } = renderHook(() => useGeneratorDocuments())

      const firstDocs = result.current.documents

      vi.mocked(useFirestoreCollection).mockReturnValue({
        data: mockRawDocuments.slice(0, 2) as any,
        loading: false,
        error: null,
        refetch: mockRefetch,
      })

      rerender()

      await waitFor(() => {
        expect(result.current.documents).not.toBe(firstDocs)
        expect(result.current.documents).toHaveLength(2)
      })
    })
  })

  describe("Edge Cases", () => {
    it("should handle empty document list", () => {
      vi.mocked(useFirestoreCollection).mockReturnValue({
        data: [],
        loading: false,
        error: null,
        refetch: mockRefetch,
      })

      const { result } = renderHook(() => useGeneratorDocuments())

      expect(result.current.documents).toEqual([])
    })

    it("should filter out non-request documents", () => {
      const mixedDocs = [
        ...mockRawDocuments,
        {
          id: "response-1",
          type: "response",
          status: "completed",
        },
      ]

      vi.mocked(useFirestoreCollection).mockReturnValue({
        data: mixedDocs as any,
        loading: false,
        error: null,
        refetch: mockRefetch,
      })

      const { result } = renderHook(() => useGeneratorDocuments())

      expect(result.current.documents).toHaveLength(4)
      expect(result.current.documents.every((d) => d.id.startsWith("doc-"))).toBe(true)
    })

    it("should handle documents with missing job data", () => {
      const incompleteDoc = {
        id: "incomplete-1",
        type: "request",
        generateType: "resume",
        job: {
          role: "",
          company: "",
        },
        status: "pending",
        createdAt: new Date(),
      }

      vi.mocked(useFirestoreCollection).mockReturnValue({
        data: [incompleteDoc] as any,
        loading: false,
        error: null,
        refetch: mockRefetch,
      })

      const { result } = renderHook(() => useGeneratorDocuments())

      expect(result.current.documents).toHaveLength(1)
      expect(result.current.documents[0].jobTitle).toBe("")
      expect(result.current.documents[0].companyName).toBe("")
    })

    it("should handle various status values", () => {
      const statusDocs = [
        { ...mockRawDocuments[0], id: "pending-1", status: "pending" },
        { ...mockRawDocuments[0], id: "processing-1", status: "processing" },
        { ...mockRawDocuments[0], id: "completed-1", status: "completed" },
        { ...mockRawDocuments[0], id: "failed-1", status: "failed" },
      ]

      vi.mocked(useFirestoreCollection).mockReturnValue({
        data: statusDocs as any,
        loading: false,
        error: null,
        refetch: mockRefetch,
      })

      const { result } = renderHook(() => useGeneratorDocuments())

      expect(result.current.documents).toHaveLength(4)
      expect(result.current.documents.map((d) => d.status)).toEqual([
        "pending",
        "processing",
        "completed",
        "failed",
      ])
    })
  })
})
