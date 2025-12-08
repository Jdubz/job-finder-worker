import { renderHook, waitFor, act } from "@testing-library/react"
import { describe, expect, it, vi, beforeEach } from "vitest"
import { useProcessingToggle } from "../useProcessingToggle"
import { configClient } from "@/api/config-client"

vi.mock("@/api/config-client", () => ({
  configClient: {
    getWorkerSettings: vi.fn(),
    updateWorkerSettings: vi.fn(),
  },
}))

vi.mock("@/services/logging/FrontendLogger", () => ({
  logger: {
    error: vi.fn(),
  },
}))

const mockSettings = {
  scraping: {
    requestTimeoutSeconds: 30,
    maxHtmlSampleLength: 20000,
  },
  textLimits: {
    minCompanyPageLength: 200,
    minSparseCompanyInfoLength: 100,
    maxIntakeTextLength: 500,
    maxIntakeDescriptionLength: 2000,
    maxIntakeFieldLength: 400,
    maxDescriptionPreviewLength: 500,
    maxCompanyInfoTextLength: 1000,
  },
  runtime: {
    processingTimeoutSeconds: 300,
    isProcessingEnabled: true,
    taskDelaySeconds: 5,
    pollIntervalSeconds: 10,
    stopReason: null,
  },
}

describe("useProcessingToggle", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("loads initial state from worker settings", async () => {
    vi.mocked(configClient.getWorkerSettings).mockResolvedValue(mockSettings)

    const { result } = renderHook(() => useProcessingToggle())

    expect(result.current.isProcessingEnabled).toBeNull() // Initially null
    expect(result.current.isToggling).toBe(false)

    await waitFor(() => {
      expect(result.current.isProcessingEnabled).toBe(true)
    })

    expect(configClient.getWorkerSettings).toHaveBeenCalledTimes(1)
    expect(result.current.stopReason).toBeNull()
  })

  it("loads disabled state with stop reason", async () => {
    vi.mocked(configClient.getWorkerSettings).mockResolvedValue({
      ...mockSettings,
      runtime: {
        ...mockSettings.runtime,
        isProcessingEnabled: false,
        stopReason: "Manually stopped",
      },
    })

    const { result } = renderHook(() => useProcessingToggle())

    await waitFor(() => {
      expect(result.current.isProcessingEnabled).toBe(false)
    })

    expect(result.current.stopReason).toBe("Manually stopped")
  })

  it("defaults to enabled when settings fail to load", async () => {
    vi.mocked(configClient.getWorkerSettings).mockRejectedValue(new Error("Network error"))

    const { result } = renderHook(() => useProcessingToggle())

    await waitFor(() => {
      expect(result.current.isProcessingEnabled).toBe(true) // Default to enabled
    })
  })

  it("toggles processing from enabled to disabled", async () => {
    vi.mocked(configClient.getWorkerSettings).mockResolvedValue(mockSettings)
    vi.mocked(configClient.updateWorkerSettings).mockResolvedValue(undefined)

    const { result } = renderHook(() => useProcessingToggle())

    await waitFor(() => {
      expect(result.current.isProcessingEnabled).toBe(true)
    })

    let toggleResult: { success: boolean; message: string } | undefined
    await act(async () => {
      toggleResult = await result.current.toggleProcessing()
    })

    expect(toggleResult?.success).toBe(true)
    expect(toggleResult?.message).toBe("Queue processing paused")
    expect(result.current.isProcessingEnabled).toBe(false)
    expect(result.current.isToggling).toBe(false)
  })

  it("toggles processing from disabled to enabled and clears stopReason", async () => {
    vi.mocked(configClient.getWorkerSettings).mockResolvedValue({
      ...mockSettings,
      runtime: {
        ...mockSettings.runtime,
        isProcessingEnabled: false,
        stopReason: "Manually stopped",
      },
    })
    vi.mocked(configClient.updateWorkerSettings).mockResolvedValue(undefined)

    const { result } = renderHook(() => useProcessingToggle())

    await waitFor(() => {
      expect(result.current.isProcessingEnabled).toBe(false)
    })

    expect(result.current.stopReason).toBe("Manually stopped")

    let toggleResult: { success: boolean; message: string } | undefined
    await act(async () => {
      toggleResult = await result.current.toggleProcessing()
    })

    expect(toggleResult?.success).toBe(true)
    expect(toggleResult?.message).toBe("Queue processing started")
    expect(result.current.isProcessingEnabled).toBe(true)
    expect(result.current.stopReason).toBeNull() // Cleared on enable
  })

  it("handles toggle error gracefully", async () => {
    vi.mocked(configClient.getWorkerSettings)
      .mockResolvedValueOnce(mockSettings)
      .mockRejectedValueOnce(new Error("Update failed"))

    const { result } = renderHook(() => useProcessingToggle())

    await waitFor(() => {
      expect(result.current.isProcessingEnabled).toBe(true)
    })

    let toggleResult: { success: boolean; message: string } | undefined
    await act(async () => {
      toggleResult = await result.current.toggleProcessing()
    })

    expect(toggleResult?.success).toBe(false)
    expect(toggleResult?.message).toBe("Failed to update queue processing state")
    expect(result.current.isToggling).toBe(false)
  })

  it("sets isToggling during toggle operation", async () => {
    vi.mocked(configClient.getWorkerSettings).mockResolvedValue(mockSettings)
    vi.mocked(configClient.updateWorkerSettings).mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 100))
    )

    const { result } = renderHook(() => useProcessingToggle())

    await waitFor(() => {
      expect(result.current.isProcessingEnabled).toBe(true)
    })

    let togglePromise: Promise<{ success: boolean; message: string }> | undefined
    act(() => {
      togglePromise = result.current.toggleProcessing()
    })

    // Check isToggling is true during operation
    expect(result.current.isToggling).toBe(true)

    await act(async () => {
      await togglePromise
    })

    expect(result.current.isToggling).toBe(false)
  })
})
