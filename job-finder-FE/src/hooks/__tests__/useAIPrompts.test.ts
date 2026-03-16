import { renderHook, waitFor, act } from "@testing-library/react"
import { describe, expect, it, vi, beforeEach } from "vitest"
import { useAIPrompts } from "../useAIPrompts"
import { promptsClient } from "@/api"

vi.mock("@/api", () => ({
  promptsClient: {
    getPrompts: vi.fn(),
    savePrompts: vi.fn(),
    resetToDefaults: vi.fn(),
  },
}))

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn().mockReturnValue({
    user: { email: "test@example.com" },
    loading: false,
    isOwner: true,
  }),
}))

const mockPrompts = {
  systemPrompt: "You are helpful",
  matchPrompt: "Match jobs",
}

describe("useAIPrompts", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("loads prompts on mount", async () => {
    vi.mocked(promptsClient.getPrompts).mockResolvedValue(mockPrompts as any)

    const { result } = renderHook(() => useAIPrompts())

    expect(result.current.loading).toBe(true)

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.prompts).toEqual(mockPrompts)
    expect(result.current.error).toBeNull()
  })

  it("handles load errors", async () => {
    vi.mocked(promptsClient.getPrompts).mockRejectedValue(new Error("Failed to load"))

    const { result } = renderHook(() => useAIPrompts())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.prompts).toBeNull()
    expect(result.current.error?.message).toBe("Failed to load")
  })

  it("saves prompts and updates local state", async () => {
    vi.mocked(promptsClient.getPrompts).mockResolvedValue(mockPrompts as any)
    vi.mocked(promptsClient.savePrompts).mockResolvedValue(undefined)

    const { result } = renderHook(() => useAIPrompts())
    await waitFor(() => expect(result.current.loading).toBe(false))

    const newPrompts = { systemPrompt: "Updated prompt", matchPrompt: "Updated match" }
    await act(async () => {
      await result.current.savePrompts(newPrompts as any)
    })

    expect(promptsClient.savePrompts).toHaveBeenCalledWith(newPrompts, "test@example.com")
    expect(result.current.saving).toBe(false)
    expect(result.current.prompts).toMatchObject(newPrompts)
  })

  it("sets saving flag during save", async () => {
    vi.mocked(promptsClient.getPrompts).mockResolvedValue(mockPrompts as any)
    let resolvePromise: () => void
    vi.mocked(promptsClient.savePrompts).mockImplementation(
      () => new Promise<void>((resolve) => { resolvePromise = resolve })
    )

    const { result } = renderHook(() => useAIPrompts())
    await waitFor(() => expect(result.current.loading).toBe(false))

    let savePromise: Promise<void>
    act(() => {
      savePromise = result.current.savePrompts({ systemPrompt: "x" } as any)
    })

    expect(result.current.saving).toBe(true)

    await act(async () => {
      resolvePromise!()
      await savePromise!
    })

    expect(result.current.saving).toBe(false)
  })

  it("propagates save errors", async () => {
    vi.mocked(promptsClient.getPrompts).mockResolvedValue(mockPrompts as any)
    vi.mocked(promptsClient.savePrompts).mockRejectedValue(new Error("Save failed"))

    const { result } = renderHook(() => useAIPrompts())
    await waitFor(() => expect(result.current.loading).toBe(false))

    let caughtError: Error | undefined
    await act(async () => {
      try {
        await result.current.savePrompts({ systemPrompt: "x" } as any)
      } catch (e) {
        caughtError = e as Error
      }
    })

    expect(caughtError?.message).toBe("Save failed")
    expect(result.current.saving).toBe(false)
  })
})
