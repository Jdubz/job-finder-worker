import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor, act } from "@testing-library/react"
import { useGeneratorDocuments } from "../useGeneratorDocuments"
import { generatorDocumentsClient } from "@/api"
import { useAuth } from "@/contexts/AuthContext"

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}))

vi.mock("@/api", () => ({
  generatorDocumentsClient: {
    listDocuments: vi.fn(),
    deleteDocument: vi.fn(),
  },
}))

describe("useGeneratorDocuments", () => {
  const mockUser = { uid: "user-123" }

  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({ user: mockUser } as any)
    vi.mocked(generatorDocumentsClient.listDocuments).mockResolvedValue([
      {
        id: "doc-1",
        documentType: "request",
        payload: {
          type: "request",
          job: { role: "Engineer", company: "ExampleCo" },
          generateType: "resume",
          status: "completed",
          createdAt: new Date().toISOString(),
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ] as any)
  })

  it("loads documents on mount", async () => {
    const { result } = renderHook(() => useGeneratorDocuments())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.documents).toHaveLength(1)
  })

  it("handles errors", async () => {
    const error = new Error("failed")
    vi.mocked(generatorDocumentsClient.listDocuments).mockRejectedValueOnce(error)

    const { result } = renderHook(() => useGeneratorDocuments())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe(error)
  })

  it("deletes documents and refetches", async () => {
    const { result } = renderHook(() => useGeneratorDocuments())

    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.deleteDocument("doc-1")
    })

    expect(generatorDocumentsClient.deleteDocument).toHaveBeenCalledWith("doc-1")
    expect(generatorDocumentsClient.listDocuments).toHaveBeenCalledTimes(2)
  })
})
