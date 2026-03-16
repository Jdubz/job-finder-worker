import { renderHook, act } from "@testing-library/react"
import { describe, expect, it, vi, beforeEach } from "vitest"
import { useRestartPersistedState } from "../useRestartPersistedState"

const mockRegister = vi.fn()
const mockConsume = vi.fn()

vi.mock("@/lib/restart-persistence", () => ({
  registerStateProvider: (...args: unknown[]) => mockRegister(...args),
  consumeSavedProviderState: (...args: unknown[]) => mockConsume(...args),
}))

vi.mock("@/services/logging/FrontendLogger", () => ({
  logger: {
    warning: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}))

describe("useRestartPersistedState", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockConsume.mockReturnValue(null)
  })

  it("initializes with provided initial state", () => {
    const { result } = renderHook(() => useRestartPersistedState("test-state", "initial"))

    expect(result.current[0]).toBe("initial")
  })

  it("initializes with factory function", () => {
    const { result } = renderHook(() => useRestartPersistedState("test-state", () => 42))

    expect(result.current[0]).toBe(42)
  })

  it("uses saved state when available", () => {
    mockConsume.mockReturnValue("saved-value")

    const { result } = renderHook(() => useRestartPersistedState("test-state", "initial"))

    expect(result.current[0]).toBe("saved-value")
    expect(mockConsume).toHaveBeenCalledWith("test-state")
  })

  it("registers state provider on mount", () => {
    renderHook(() => useRestartPersistedState("my-state", "value"))

    expect(mockRegister).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "my-state",
        version: 1,
      })
    )
  })

  it("updates state via setState", () => {
    const { result } = renderHook(() => useRestartPersistedState("test-state", "initial"))

    act(() => {
      result.current[1]("updated")
    })

    expect(result.current[0]).toBe("updated")
  })

  it("supports functional setState updates", () => {
    const { result } = renderHook(() => useRestartPersistedState("counter", 0))

    act(() => {
      result.current[1]((prev) => prev + 1)
    })

    expect(result.current[0]).toBe(1)
  })

  it("passes custom version to provider", () => {
    renderHook(() => useRestartPersistedState("versioned", "data", 3))

    expect(mockRegister).toHaveBeenCalledWith(expect.objectContaining({ version: 3 }))
  })

  it("serialize returns current state", () => {
    renderHook(() => useRestartPersistedState("test", "hello"))

    const provider = mockRegister.mock.calls[0][0]
    expect(provider.serialize()).toBe("hello")
  })
})
