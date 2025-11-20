import { renderHook, act, waitFor } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { useContentItems } from "../useContentItems"

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}))

vi.mock("@/api", () => ({
  contentItemsClient: {
    list: vi.fn(),
    createContentItem: vi.fn(),
    updateContentItem: vi.fn(),
    deleteContentItem: vi.fn(),
  },
}))

const { useAuth } = await import("@/contexts/AuthContext")
const { contentItemsClient } = await import("@/api")

describe("useContentItems", () => {
  const mockUser = {
    id: "user-123",
    email: "user@example.com",
  }

  const mockItems = [
    {
      id: "item-1",
      type: "company",
      userId: "user-123",
      order: 1,
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
      createdBy: "user@example.com",
      updatedBy: "user@example.com",
      visibility: "published",
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({
      user: mockUser,
    } as any)
    vi.mocked(contentItemsClient.list).mockResolvedValue(mockItems as any)
    vi.mocked(contentItemsClient.createContentItem).mockResolvedValue(mockItems[0] as any)
    vi.mocked(contentItemsClient.updateContentItem).mockResolvedValue(mockItems[0] as any)
  })

  it("fetches content items on mount", async () => {
    const { result } = renderHook(() => useContentItems())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(contentItemsClient.list).toHaveBeenCalled()
    expect(result.current.contentItems).toHaveLength(1)
  })

  it("handles fetch errors", async () => {
    const error = new Error("Failed to load")
    vi.mocked(contentItemsClient.list).mockRejectedValueOnce(error)

    const { result } = renderHook(() => useContentItems())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe(error)
    expect(result.current.contentItems).toEqual([])
  })

  it("creates content items", async () => {
    const { result } = renderHook(() => useContentItems())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.createContentItem({
        type: "company",
        userId: mockUser.id,
        parentId: null,
        order: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: mockUser.email!,
        updatedBy: mockUser.email!,
      } as any)
    })

    expect(contentItemsClient.createContentItem).toHaveBeenCalled()
  })

  it("updates content items", async () => {
    const { result } = renderHook(() => useContentItems())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.updateContentItem("item-1", {
        visibility: "draft",
      } as any)
    })

    expect(contentItemsClient.updateContentItem).toHaveBeenCalledWith(
      "item-1",
      mockUser.email,
      expect.objectContaining({ visibility: "draft" })
    )
  })

  it("deletes content items", async () => {
    const { result } = renderHook(() => useContentItems())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.deleteContentItem("item-1")
    })

    expect(contentItemsClient.deleteContentItem).toHaveBeenCalledWith("item-1")
  })
})
