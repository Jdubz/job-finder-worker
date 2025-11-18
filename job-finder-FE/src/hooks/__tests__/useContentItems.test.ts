/**
 * useContentItems Hook Tests
 *
 * Tests for content items hook including:
 * - Loading content items
 * - CRUD operations
 * - Error handling
 * - Authentication requirements
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook } from "@testing-library/react"
import { useContentItems } from "../useContentItems"
import { useAuth } from "@/contexts/AuthContext"
import { useFirestore } from "@/contexts/FirestoreContext"
import { useFirestoreCollection } from "../useFirestoreCollection"

// Mock dependencies
vi.mock("@/contexts/AuthContext")
vi.mock("@/contexts/FirestoreContext")
vi.mock("../useFirestoreCollection")

describe("useContentItems", () => {
  const mockUser = {
    uid: "test-user-123",
    email: "test@example.com",
  }

  const mockContentItems = [
    {
      id: "company-1",
      type: "company",
      company: "Tech Corp",
      role: "Software Engineer",
      startDate: "2020-01",
      endDate: "2023-12",
      parentId: null,
      order: 0,
      userId: "test-user-123",
      createdBy: "test-user-123",
      updatedBy: "test-user-123",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    },
    {
      id: "skill-1",
      type: "skill-group",
      name: "Frontend",
      skills: ["React", "TypeScript"],
      parentId: null,
      order: 1,
      userId: "test-user-123",
      createdBy: "test-user-123",
      updatedBy: "test-user-123",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    },
  ]

  const mockFirestoreService = {
    createDocument: vi.fn(),
    updateDocument: vi.fn(),
    deleteDocument: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(useAuth).mockReturnValue({
      user: mockUser as any,
      loading: false,
      signOut: vi.fn(),
      signInWithGoogle: vi.fn(),
    } as any)

    vi.mocked(useFirestore).mockReturnValue({
      service: mockFirestoreService as any,
    } as any)

    vi.mocked(useFirestoreCollection).mockReturnValue({
      data: mockContentItems as any,
      loading: false,
      error: null,
      refetch: vi.fn(),
    })
  })

  describe("Loading Content Items", () => {
    it("should load content items for authenticated user", () => {
      const { result } = renderHook(() => useContentItems())

      expect(result.current.contentItems).toHaveLength(2)
      expect(result.current.contentItems[0].type).toBe("company")
      expect(result.current.contentItems[1].type).toBe("skill-group")
    })

    it("should show loading state", () => {
      vi.mocked(useFirestoreCollection).mockReturnValue({
        data: [],
        loading: true,
        error: null,
        refetch: vi.fn(),
      })

      const { result } = renderHook(() => useContentItems())

      expect(result.current.loading).toBe(true)
      expect(result.current.contentItems).toEqual([])
    })

    it("should handle errors", () => {
      const mockError = new Error("Failed to load")
      vi.mocked(useFirestoreCollection).mockReturnValue({
        data: [],
        loading: false,
        error: mockError,
        refetch: vi.fn(),
      })

      const { result } = renderHook(() => useContentItems())

      expect(result.current.error).toBe(mockError)
      expect(result.current.contentItems).toEqual([])
    })

    it("should not load when user is not authenticated", () => {
      vi.mocked(useAuth).mockReturnValue({
        user: null,
        loading: false,
        signOut: vi.fn(),
        signInWithGoogle: vi.fn(),
      } as any)

      renderHook(() => useContentItems())

      expect(useFirestoreCollection).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: false,
        })
      )
    })

    it("should order items by order field", () => {
      renderHook(() => useContentItems())

      expect(useFirestoreCollection).toHaveBeenCalledWith(
        expect.objectContaining({
          constraints: expect.objectContaining({
            orderBy: expect.arrayContaining([
              expect.objectContaining({
                field: "order",
                direction: "asc",
              }),
            ]),
          }),
        })
      )
    })
  })

  describe("createContentItem", () => {
    it("should create a new content item", async () => {
      mockFirestoreService.createDocument.mockResolvedValue("new-item-id")

      const { result } = renderHook(() => useContentItems())

      const newItem = {
        type: "company" as const,
        company: "New Corp",
        role: "Developer",
        startDate: "2024-01",
        endDate: "present",
        location: "Remote",
        parentId: null,
        order: 2,
        visibility: "published" as const,
      }

      const itemId = await result.current.createContentItem(newItem)

      expect(mockFirestoreService.createDocument).toHaveBeenCalledWith(
        "content-items",
        expect.objectContaining({
          type: "company",
          company: "New Corp",
          role: "Developer",
          userId: "test-user-123",
          createdBy: "test-user-123",
          updatedBy: "test-user-123",
        })
      )
      expect(itemId).toBe("new-item-id")
    })

    it("should throw error when user is not authenticated", async () => {
      vi.mocked(useAuth).mockReturnValue({
        user: null,
        loading: false,
        signOut: vi.fn(),
        signInWithGoogle: vi.fn(),
      } as any)

      const { result } = renderHook(() => useContentItems())

      await expect(
        result.current.createContentItem({
          type: "company" as const,
          company: "Test",
          role: "Test Role",
          startDate: "2023-01",
          endDate: "present",
          location: "Remote",
          parentId: null,
          order: 0,
          visibility: "published" as const,
        } as any)
      ).rejects.toThrow("User must be authenticated")
    })

    it("should include userId for filtering", async () => {
      mockFirestoreService.createDocument.mockResolvedValue("new-id")

      const { result } = renderHook(() => useContentItems())

      await result.current.createContentItem({
        type: "skill-group" as const,
        category: "Backend",
        skills: ["Node.js", "Python"],
        parentId: null,
        order: 0,
        visibility: "published" as const,
      } as any)

      expect(mockFirestoreService.createDocument).toHaveBeenCalledWith(
        "content-items",
        expect.objectContaining({
          userId: "test-user-123",
        })
      )
    })

    it("should handle create errors", async () => {
      mockFirestoreService.createDocument.mockRejectedValue(new Error("Creation failed"))

      const { result } = renderHook(() => useContentItems())

      await expect(
        result.current.createContentItem({
          type: "company" as const,
          company: "Test",
          role: "Test Role",
          startDate: "2023-01",
          endDate: "present",
          location: "Remote",
          parentId: null,
          order: 0,
          visibility: "published" as const,
        } as any)
      ).rejects.toThrow("Creation failed")
    })
  })

  describe("updateContentItem", () => {
    it("should update an existing content item", async () => {
      mockFirestoreService.updateDocument.mockResolvedValue(undefined)

      const { result } = renderHook(() => useContentItems())

      const updates = {
        role: "Senior Developer",
        endDate: "2024-12",
      }

      await result.current.updateContentItem("company-1", updates)

      expect(mockFirestoreService.updateDocument).toHaveBeenCalledWith(
        "content-items",
        "company-1",
        expect.objectContaining({
          role: "Senior Developer",
          endDate: "2024-12",
          updatedBy: "test-user-123",
        })
      )
    })

    it("should throw error when user is not authenticated", async () => {
      vi.mocked(useAuth).mockReturnValue({
        user: null,
        loading: false,
        signOut: vi.fn(),
        signInWithGoogle: vi.fn(),
      } as any)

      const { result } = renderHook(() => useContentItems())

      await expect(
        result.current.updateContentItem("company-1", { role: "Manager" })
      ).rejects.toThrow("User must be authenticated")
    })

    it("should include updatedBy field", async () => {
      mockFirestoreService.updateDocument.mockResolvedValue(undefined)

      const { result } = renderHook(() => useContentItems())

      await result.current.updateContentItem("company-1", { role: "Lead" })

      expect(mockFirestoreService.updateDocument).toHaveBeenCalledWith(
        "content-items",
        "company-1",
        expect.objectContaining({
          updatedBy: "test-user-123",
        })
      )
    })

    it("should handle update errors", async () => {
      mockFirestoreService.updateDocument.mockRejectedValue(new Error("Update failed"))

      const { result } = renderHook(() => useContentItems())

      await expect(result.current.updateContentItem("company-1", { role: "Test" })).rejects.toThrow(
        "Update failed"
      )
    })
  })

  describe("deleteContentItem", () => {
    it("should delete a content item", async () => {
      mockFirestoreService.deleteDocument.mockResolvedValue(undefined)

      const { result } = renderHook(() => useContentItems())

      await result.current.deleteContentItem("company-1")

      expect(mockFirestoreService.deleteDocument).toHaveBeenCalledWith("content-items", "company-1")
    })

    it("should throw error when user is not authenticated", async () => {
      vi.mocked(useAuth).mockReturnValue({
        user: null,
        loading: false,
        signOut: vi.fn(),
        signInWithGoogle: vi.fn(),
      } as any)

      const { result } = renderHook(() => useContentItems())

      await expect(result.current.deleteContentItem("company-1")).rejects.toThrow(
        "User must be authenticated"
      )
    })

    it("should handle delete errors", async () => {
      mockFirestoreService.deleteDocument.mockRejectedValue(new Error("Delete failed"))

      const { result } = renderHook(() => useContentItems())

      await expect(result.current.deleteContentItem("company-1")).rejects.toThrow("Delete failed")
    })
  })

  describe("refetch", () => {
    it("should provide refetch function", () => {
      const mockRefetch = vi.fn()
      vi.mocked(useFirestoreCollection).mockReturnValue({
        data: mockContentItems as any,
        loading: false,
        error: null,
        refetch: mockRefetch,
      })

      const { result } = renderHook(() => useContentItems())

      expect(result.current.refetch).toBeDefined()
      expect(typeof result.current.refetch).toBe("function")
    })

    it("should call refetch from useFirestoreCollection", async () => {
      const mockRefetch = vi.fn().mockResolvedValue(undefined)
      vi.mocked(useFirestoreCollection).mockReturnValue({
        data: mockContentItems as any,
        loading: false,
        error: null,
        refetch: mockRefetch,
      })

      const { result } = renderHook(() => useContentItems())

      await result.current.refetch()

      expect(mockRefetch).toHaveBeenCalled()
    })
  })

  describe("Content Item Types", () => {
    it("should support company items", async () => {
      mockFirestoreService.createDocument.mockResolvedValue("id")

      const { result } = renderHook(() => useContentItems())

      await result.current.createContentItem({
        type: "company",
        company: "Test Corp",
        role: "Engineer",
        startDate: "2024-01",
        parentId: null,
        order: 0,
      } as any)

      expect(mockFirestoreService.createDocument).toHaveBeenCalledWith(
        "content-items",
        expect.objectContaining({
          type: "company",
        })
      )
    })

    it("should support project items", async () => {
      mockFirestoreService.createDocument.mockResolvedValue("id")

      const { result } = renderHook(() => useContentItems())

      await result.current.createContentItem({
        type: "project",
        name: "E-commerce Site",
        description: "Built a site",
        parentId: "company-1",
        order: 0,
        visibility: "published" as const,
      } as any)

      expect(mockFirestoreService.createDocument).toHaveBeenCalledWith(
        "content-items",
        expect.objectContaining({
          type: "project",
        })
      )
    })

    it("should support skill-group items", async () => {
      mockFirestoreService.createDocument.mockResolvedValue("id")

      const { result } = renderHook(() => useContentItems())

      await result.current.createContentItem({
        type: "skill-group",
        category: "Frontend",
        skills: ["React", "Vue"],
        parentId: null,
        order: 0,
        visibility: "published" as const,
      } as any)

      expect(mockFirestoreService.createDocument).toHaveBeenCalledWith(
        "content-items",
        expect.objectContaining({
          type: "skill-group",
        })
      )
    })

    it("should support text section items", async () => {
      mockFirestoreService.createDocument.mockResolvedValue("id")

      const { result } = renderHook(() => useContentItems())

      await result.current.createContentItem({
        type: "text-section",
        heading: "Education",
        content: "BS Computer Science from University",
        parentId: null,
        order: 0,
        visibility: "published" as const,
      } as any)

      expect(mockFirestoreService.createDocument).toHaveBeenCalledWith(
        "content-items",
        expect.objectContaining({
          type: "text-section",
        })
      )
    })
  })

  describe("Hierarchy Support", () => {
    it("should support nested items with parentId", async () => {
      mockFirestoreService.createDocument.mockResolvedValue("id")

      const { result } = renderHook(() => useContentItems())

      await result.current.createContentItem({
        type: "project",
        name: "Nested Project",
        description: "A nested project",
        parentId: "company-1",
        order: 0,
        visibility: "published" as const,
      } as any)

      expect(mockFirestoreService.createDocument).toHaveBeenCalledWith(
        "content-items",
        expect.objectContaining({
          parentId: "company-1",
        })
      )
    })

    it("should support root-level items with null parentId", async () => {
      mockFirestoreService.createDocument.mockResolvedValue("id")

      const { result } = renderHook(() => useContentItems())

      await result.current.createContentItem({
        type: "company",
        company: "Root Company",
        role: "Software Engineer",
        startDate: "2023-01",
        endDate: "present",
        location: "Remote",
        parentId: null,
        order: 0,
        visibility: "published" as const,
      } as any)

      expect(mockFirestoreService.createDocument).toHaveBeenCalledWith(
        "content-items",
        expect.objectContaining({
          parentId: null,
        })
      )
    })

    it("should maintain order within hierarchy", async () => {
      mockFirestoreService.createDocument.mockResolvedValue("id")

      const { result } = renderHook(() => useContentItems())

      await result.current.createContentItem({
        type: "company",
        company: "Ordered Company",
        role: "Software Engineer",
        startDate: "2023-01",
        endDate: "present",
        location: "Remote",
        parentId: null,
        order: 5,
        visibility: "published" as const,
      } as any)

      expect(mockFirestoreService.createDocument).toHaveBeenCalledWith(
        "content-items",
        expect.objectContaining({
          order: 5,
        })
      )
    })
  })
})
