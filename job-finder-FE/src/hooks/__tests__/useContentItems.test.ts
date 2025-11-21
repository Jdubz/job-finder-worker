import { renderHook, act, waitFor } from "@testing-library/react"
import { describe, expect, it, vi, beforeEach } from "vitest"
import { useContentItems } from "../useContentItems"
import { contentItemsClient } from "@/api"

const mockUser = { id: "user-123", email: "user@example.com" }

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: mockUser })
}))

// Mock functions must be defined inside the factory to avoid hoisting issues
vi.mock("@/api", () => ({
  contentItemsClient: {
    list: vi.fn().mockResolvedValue([]),
    createContentItem: vi.fn().mockResolvedValue({}),
    updateContentItem: vi.fn().mockResolvedValue({}),
    deleteContentItem: vi.fn().mockResolvedValue({}),
    reorderContentItem: vi.fn().mockResolvedValue({})
  }
}))

describe("useContentItems", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("fetches content items for the active user", async () => {
    renderHook(() => useContentItems())
    await waitFor(() => expect(contentItemsClient.list).toHaveBeenCalled())
    expect(contentItemsClient.list).toHaveBeenCalledWith(mockUser.id, { includeDrafts: true })
  })

  it("creates new content items using the current user context", async () => {
    const { result } = renderHook(() => useContentItems())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.createContentItem({
        userId: mockUser.id,
        title: "New Item",
        parentId: null
      })
    })

    expect(contentItemsClient.createContentItem).toHaveBeenCalledWith(mockUser.email, {
      userId: mockUser.id,
      title: "New Item",
      parentId: null
    })
  })

  it("reorders items via the API client", async () => {
    const { result } = renderHook(() => useContentItems())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.reorderContentItem("item-1", null, 0)
    })

    expect(contentItemsClient.reorderContentItem).toHaveBeenCalledWith("item-1", mockUser.email, null, 0)
  })
})
