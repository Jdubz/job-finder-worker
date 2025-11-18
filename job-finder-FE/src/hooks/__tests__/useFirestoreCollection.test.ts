/**
 * Tests for useFirestoreCollection Hook
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { useFirestoreCollection } from "../useFirestoreCollection"
import { useFirestore } from "@/contexts/FirestoreContext"

vi.mock("@/contexts/FirestoreContext")

describe("useFirestoreCollection", () => {
  const mockData = [
    { id: "1", name: "Item 1", order: 1 },
    { id: "2", name: "Item 2", order: 2 },
    { id: "3", name: "Item 3", order: 3 },
  ]

  const mockFirestoreService = {
    getDocument: vi.fn(),
    setDocument: vi.fn(),
    updateDocument: vi.fn(),
    createDocument: vi.fn(),
    deleteDocument: vi.fn(),
    getDocuments: vi.fn(),
    subscribeToDocument: vi.fn(),
  }

  const mockSubscribeToCollection = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(useFirestore).mockReturnValue({
      service: mockFirestoreService,
      subscribeToCollection: mockSubscribeToCollection,
      subscribeToDocument: vi.fn(),
    } as any)
  })

  it("should subscribe to collection on mount", async () => {
    const unsubscribe = vi.fn()
    mockSubscribeToCollection.mockImplementation((_, onData) => {
      onData(mockData)
      return unsubscribe
    })

    const { result } = renderHook(() =>
      useFirestoreCollection({
        collectionName: "content-items",
      })
    )

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.data).toEqual(mockData)
    expect(result.current.error).toBeNull()
    expect(mockSubscribeToCollection).toHaveBeenCalledWith(
      "content-items",
      expect.any(Function),
      expect.any(Function),
      undefined,
      undefined
    )
  })

  it("should handle subscription error", async () => {
    const error = new Error("Subscription failed")
    mockSubscribeToCollection.mockImplementation((_, __, onError) => {
      onError(error)
      return vi.fn()
    })

    const { result } = renderHook(() =>
      useFirestoreCollection({
        collectionName: "content-items",
      })
    )

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.data).toEqual([])
    expect(result.current.error).toEqual(error)
  })

  it("should not subscribe when disabled", () => {
    const { result } = renderHook(() =>
      useFirestoreCollection({
        collectionName: "content-items",
        enabled: false,
      })
    )

    expect(result.current.loading).toBe(false)
    expect(mockSubscribeToCollection).not.toHaveBeenCalled()
  })

  it("should pass constraints to subscription", async () => {
    const unsubscribe = vi.fn()
    mockSubscribeToCollection.mockImplementation((_, onData) => {
      onData(mockData)
      return unsubscribe
    })

    const constraints = {
      orderBy: [{ field: "order", direction: "asc" as const }],
      limit: 10,
    }

    renderHook(() =>
      useFirestoreCollection({
        collectionName: "content-items",
        constraints,
      })
    )

    await waitFor(() => {
      expect(mockSubscribeToCollection).toHaveBeenCalledWith(
        "content-items",
        expect.any(Function),
        expect.any(Function),
        constraints,
        undefined
      )
    })
  })

  it("should pass cache key to subscription", async () => {
    const unsubscribe = vi.fn()
    mockSubscribeToCollection.mockImplementation((_, onData) => {
      onData(mockData)
      return unsubscribe
    })

    renderHook(() =>
      useFirestoreCollection({
        collectionName: "content-items",
        cacheKey: "my-cache-key",
      })
    )

    await waitFor(() => {
      expect(mockSubscribeToCollection).toHaveBeenCalledWith(
        "content-items",
        expect.any(Function),
        expect.any(Function),
        undefined,
        "my-cache-key"
      )
    })
  })

  it("should unsubscribe on unmount", async () => {
    const unsubscribe = vi.fn()
    mockSubscribeToCollection.mockImplementation((_, onData) => {
      onData(mockData)
      return unsubscribe
    })

    const { unmount } = renderHook(() =>
      useFirestoreCollection({
        collectionName: "content-items",
      })
    )

    await waitFor(() => {
      expect(mockSubscribeToCollection).toHaveBeenCalled()
    })

    unmount()

    expect(unsubscribe).toHaveBeenCalled()
  })

  it("should refetch data", async () => {
    const unsubscribe = vi.fn()
    mockSubscribeToCollection.mockImplementation((_, onData) => {
      onData(mockData)
      return unsubscribe
    })

    mockFirestoreService.getDocuments.mockResolvedValue([{ id: "4", name: "Item 4", order: 4 }])

    const { result } = renderHook(() =>
      useFirestoreCollection({
        collectionName: "content-items",
      })
    )

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    await result.current.refetch()

    await waitFor(() => {
      expect(result.current.data).toEqual([{ id: "4", name: "Item 4", order: 4 }])
    })

    expect(mockFirestoreService.getDocuments).toHaveBeenCalledWith("content-items", undefined)
  })

  it("should handle refetch error", async () => {
    const unsubscribe = vi.fn()
    mockSubscribeToCollection.mockImplementation((_, onData) => {
      onData(mockData)
      return unsubscribe
    })

    const error = new Error("Refetch failed")
    mockFirestoreService.getDocuments.mockRejectedValue(error)

    const { result } = renderHook(() =>
      useFirestoreCollection({
        collectionName: "content-items",
      })
    )

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    await result.current.refetch()

    await waitFor(() => {
      expect(result.current.error).toEqual(error)
    })
  })

  it("should resubscribe when collection name changes", async () => {
    const unsubscribe1 = vi.fn()
    const unsubscribe2 = vi.fn()
    let callCount = 0

    mockSubscribeToCollection.mockImplementation((_, onData) => {
      onData(mockData)
      callCount++
      return callCount === 1 ? unsubscribe1 : unsubscribe2
    })

    const { rerender } = renderHook(
      (props: { collectionName: any }) =>
        useFirestoreCollection({
          collectionName: props.collectionName,
        }),
      {
        initialProps: { collectionName: "content-items" as any },
      }
    )

    await waitFor(() => {
      expect(mockSubscribeToCollection).toHaveBeenCalledTimes(1)
    })

    rerender({ collectionName: "queue-items" as any })

    await waitFor(() => {
      expect(mockSubscribeToCollection).toHaveBeenCalledTimes(2)
    })

    expect(unsubscribe1).toHaveBeenCalled()
  })

  it("should resubscribe when constraints change", async () => {
    const unsubscribe1 = vi.fn()
    const unsubscribe2 = vi.fn()
    let callCount = 0

    mockSubscribeToCollection.mockImplementation((_, onData) => {
      onData(mockData)
      callCount++
      return callCount === 1 ? unsubscribe1 : unsubscribe2
    })

    const { rerender } = renderHook(
      (props: { constraints?: any }) =>
        useFirestoreCollection({
          collectionName: "content-items",
          constraints: props.constraints,
        }),
      {
        initialProps: {
          constraints: { limit: 10 },
        },
      }
    )

    await waitFor(() => {
      expect(mockSubscribeToCollection).toHaveBeenCalledTimes(1)
    })

    rerender({ constraints: { limit: 20 } })

    await waitFor(() => {
      expect(mockSubscribeToCollection).toHaveBeenCalledTimes(2)
    })

    expect(unsubscribe1).toHaveBeenCalled()
  })

  it("should start with loading state", () => {
    mockSubscribeToCollection.mockImplementation(() => vi.fn())

    const { result } = renderHook(() =>
      useFirestoreCollection({
        collectionName: "content-items",
      })
    )

    expect(result.current.loading).toBe(true)
    expect(result.current.data).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it("should handle empty collection", async () => {
    const unsubscribe = vi.fn()
    mockSubscribeToCollection.mockImplementation((_, onData) => {
      onData([])
      return unsubscribe
    })

    const { result } = renderHook(() =>
      useFirestoreCollection({
        collectionName: "content-items",
      })
    )

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.data).toEqual([])
    expect(result.current.error).toBeNull()
  })
})
