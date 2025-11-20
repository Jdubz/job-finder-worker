import { renderHook, act, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { useContentItems } from "../useContentItems"

const mockUser = { id: "user-123", email: "user@example.com" }

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: mockUser })
}))

const listMock = vi.fn().mockResolvedValue([])
const createMock = vi.fn().mockResolvedValue({})
const updateMock = vi.fn().mockResolvedValue({})
const deleteMock = vi.fn().mockResolvedValue({})
const reorderMock = vi.fn().mockResolvedValue({})

vi.mock("@/api", () => ({
  contentItemsClient: {
    list: listMock,
    createContentItem: createMock,
    updateContentItem: updateMock,
    deleteContentItem: deleteMock,
    reorderContentItem: reorderMock
  }
}))

describe("useContentItems", () => {
  it("fetches content items for the active user", async () => {
    renderHook(() => useContentItems())
    await waitFor(() => expect(listMock).toHaveBeenCalled())
    expect(listMock).toHaveBeenCalledWith(mockUser.id, { includeDrafts: true })
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

    expect(createMock).toHaveBeenCalledWith(mockUser.email, {
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

    expect(reorderMock).toHaveBeenCalledWith("item-1", mockUser.email, null, 0)
  })
})
