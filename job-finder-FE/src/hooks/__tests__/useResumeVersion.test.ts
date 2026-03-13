import { renderHook, act, waitFor } from "@testing-library/react"
import { describe, expect, it, vi, beforeEach } from "vitest"
import { useResumeVersion } from "../useResumeVersion"
import { resumeVersionsClient } from "@/api"
import type { ResumeVersion, ResumeItemNode } from "@shared/types"

const mockUser = { id: "user-123", email: "admin@example.com" }

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: mockUser })
}))

const mockVersion: ResumeVersion = {
  id: "v-1",
  slug: "pool",
  name: "Resume Pool",
  description: "Master pool of curated resume content",
  pdfPath: null,
  pdfSizeBytes: null,
  publishedAt: null,
  publishedBy: null,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01")
}

const mockItems: ResumeItemNode[] = [
  {
    id: "item-1",
    resumeVersionId: "v-1",
    parentId: null,
    orderIndex: 0,
    aiContext: "work",
    title: "Company A",
    role: "Engineer",
    location: null,
    website: null,
    startDate: "2023-01",
    endDate: null,
    description: "Did things",
    skills: ["TypeScript"],
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    createdBy: "admin@example.com",
    updatedBy: "admin@example.com"
  }
]

vi.mock("@/api", () => ({
  resumeVersionsClient: {
    getVersion: vi.fn().mockResolvedValue({ version: null, items: [], contentFit: null }),
    createItem: vi.fn().mockResolvedValue({}),
    updateItem: vi.fn().mockResolvedValue({}),
    deleteItem: vi.fn().mockResolvedValue(undefined),
    reorderItem: vi.fn().mockResolvedValue({}),
    publish: vi.fn().mockResolvedValue({ version: null, message: "ok" })
  }
}))

describe("useResumeVersion", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(resumeVersionsClient.getVersion).mockResolvedValue({
      version: mockVersion,
      items: mockItems,
      contentFit: null
    })
  })

  it("fetches version data on mount", async () => {
    const { result } = renderHook(() => useResumeVersion("pool"))

    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(resumeVersionsClient.getVersion).toHaveBeenCalledWith("pool")
    expect(result.current.version).toEqual(mockVersion)
    expect(result.current.items).toEqual(mockItems)
    expect(result.current.error).toBeNull()
  })

  it("handles fetch errors", async () => {
    const error = new Error("Network error")
    vi.mocked(resumeVersionsClient.getVersion).mockRejectedValue(error)

    const { result } = renderHook(() => useResumeVersion("pool"))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.error).toEqual(error)
    expect(result.current.version).toBeNull()
    expect(result.current.items).toEqual([])
  })

  it("refetches when slug changes", async () => {
    const { result, rerender } = renderHook(
      ({ slug }) => useResumeVersion(slug),
      { initialProps: { slug: "pool" } }
    )

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(resumeVersionsClient.getVersion).toHaveBeenCalledWith("pool")

    rerender({ slug: "other-version" })
    await waitFor(() =>
      expect(resumeVersionsClient.getVersion).toHaveBeenCalledWith("other-version")
    )
  })

  it("creates an item and refetches", async () => {
    const mockCreated = { id: "new-1" }
    vi.mocked(resumeVersionsClient.createItem).mockResolvedValue(mockCreated as never)

    const { result } = renderHook(() => useResumeVersion("pool"))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.createItem({ title: "New Section", parentId: null })
    })

    expect(resumeVersionsClient.createItem).toHaveBeenCalledWith("pool", {
      title: "New Section",
      parentId: null
    })
    // Should refetch after mutation
    expect(resumeVersionsClient.getVersion).toHaveBeenCalledTimes(2)
  })

  it("updates an item and refetches", async () => {
    const { result } = renderHook(() => useResumeVersion("pool"))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.updateItem("item-1", { title: "Updated" })
    })

    expect(resumeVersionsClient.updateItem).toHaveBeenCalledWith(
      "pool",
      "item-1",
      { title: "Updated" }
    )
    expect(resumeVersionsClient.getVersion).toHaveBeenCalledTimes(2)
  })

  it("deletes an item and refetches", async () => {
    const { result } = renderHook(() => useResumeVersion("pool"))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.deleteItem("item-1")
    })

    expect(resumeVersionsClient.deleteItem).toHaveBeenCalledWith("pool", "item-1")
    expect(resumeVersionsClient.getVersion).toHaveBeenCalledTimes(2)
  })

  it("publishes and updates version state", async () => {
    const publishedVersion = { ...mockVersion, pdfPath: "resumes/pool.pdf" }
    vi.mocked(resumeVersionsClient.publish).mockResolvedValue({
      version: publishedVersion,
      message: "Published"
    })

    const { result } = renderHook(() => useResumeVersion("pool"))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.publishing).toBe(false)

    await act(async () => {
      await result.current.publish()
    })

    expect(resumeVersionsClient.publish).toHaveBeenCalledWith("pool")
    expect(result.current.publishing).toBe(false)
  })

  it("reorders an item and refetches", async () => {
    const { result } = renderHook(() => useResumeVersion("pool"))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.reorderItem("item-1", null, 2)
    })

    expect(resumeVersionsClient.reorderItem).toHaveBeenCalledWith(
      "pool",
      "item-1",
      null,
      2
    )
    expect(resumeVersionsClient.getVersion).toHaveBeenCalledTimes(2)
  })
})
