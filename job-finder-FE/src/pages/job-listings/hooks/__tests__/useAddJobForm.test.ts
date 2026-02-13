import { renderHook, act } from "@testing-library/react"
import { describe, expect, it, vi, beforeEach } from "vitest"
import { useAddJobForm } from "../useAddJobForm"

const mockSubmitJob = vi.fn()

vi.mock("@/hooks/useQueueItems", () => ({
  useQueueItems: () => ({
    submitJob: mockSubmitJob,
  }),
}))

vi.mock("@/services/logging/FrontendLogger", () => ({
  logger: {
    error: vi.fn(),
  },
}))

describe("useAddJobForm", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("initializes with empty form state", () => {
    const { result } = renderHook(() => useAddJobForm())

    expect(result.current.formState).toEqual({
      jobUrl: "",
    })
    expect(result.current.isSubmitting).toBe(false)
    expect(result.current.submitError).toBeNull()
    expect(result.current.isModalOpen).toBe(false)
  })

  it("updates form fields with setField", () => {
    const { result } = renderHook(() => useAddJobForm())

    act(() => {
      result.current.setField("jobUrl", "https://example.com/job")
    })
    expect(result.current.formState.jobUrl).toBe("https://example.com/job")
  })

  it("resets form to initial state", () => {
    const { result } = renderHook(() => useAddJobForm())

    act(() => {
      result.current.setField("jobUrl", "https://example.com/job")
    })

    expect(result.current.formState.jobUrl).toBe("https://example.com/job")

    act(() => {
      result.current.resetForm()
    })

    expect(result.current.formState).toEqual({
      jobUrl: "",
    })
  })

  it("validates required fields - missing URL", async () => {
    const { result } = renderHook(() => useAddJobForm())

    const mockEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent

    await act(async () => {
      await result.current.handleSubmit(mockEvent)
    })

    expect(mockEvent.preventDefault).toHaveBeenCalled()
    expect(result.current.submitError).toBe("Job URL is required")
    expect(mockSubmitJob).not.toHaveBeenCalled()
  })

  it("submits form successfully with URL only", async () => {
    mockSubmitJob.mockResolvedValue({ id: "job-123" })

    const { result } = renderHook(() => useAddJobForm())

    act(() => {
      result.current.setField("jobUrl", "https://example.com/job")
    })

    const mockEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent

    await act(async () => {
      await result.current.handleSubmit(mockEvent)
    })

    expect(mockSubmitJob).toHaveBeenCalledWith({
      url: "https://example.com/job",
    })

    expect(result.current.submitError).toBeNull()
    expect(result.current.isModalOpen).toBe(false)
  })

  it("does not navigate after successful submission", async () => {
    mockSubmitJob.mockResolvedValue({ id: "job-123" })

    const { result } = renderHook(() => useAddJobForm())

    act(() => {
      result.current.setField("jobUrl", "https://example.com/job")
    })

    const mockEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent

    await act(async () => {
      await result.current.handleSubmit(mockEvent)
    })

    // Modal should close but no navigation should occur
    expect(result.current.isModalOpen).toBe(false)
    expect(result.current.formState.jobUrl).toBe("")
  })

  it("handles submission error", async () => {
    mockSubmitJob.mockRejectedValue(new Error("Server error"))

    const { result } = renderHook(() => useAddJobForm())

    act(() => {
      result.current.setField("jobUrl", "https://example.com/job")
    })

    const mockEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent

    await act(async () => {
      await result.current.handleSubmit(mockEvent)
    })

    expect(result.current.submitError).toBe("Server error")
    expect(result.current.isSubmitting).toBe(false)
  })

  it("manages modal open/close state", () => {
    const { result } = renderHook(() => useAddJobForm())

    expect(result.current.isModalOpen).toBe(false)

    act(() => {
      result.current.setIsModalOpen(true)
    })

    expect(result.current.isModalOpen).toBe(true)

    act(() => {
      result.current.setIsModalOpen(false)
    })

    expect(result.current.isModalOpen).toBe(false)
  })

  it("resets form when modal is closed", () => {
    const { result } = renderHook(() => useAddJobForm())

    act(() => {
      result.current.setIsModalOpen(true)
      result.current.setField("jobUrl", "https://example.com/job")
    })

    expect(result.current.formState.jobUrl).toBe("https://example.com/job")

    act(() => {
      result.current.setIsModalOpen(false)
    })

    expect(result.current.formState.jobUrl).toBe("")
  })

  it("trims whitespace from URL on submit", async () => {
    mockSubmitJob.mockResolvedValue({ id: "job-123" })

    const { result } = renderHook(() => useAddJobForm())

    act(() => {
      result.current.setField("jobUrl", "  https://example.com/job  ")
    })

    const mockEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent

    await act(async () => {
      await result.current.handleSubmit(mockEvent)
    })

    expect(mockSubmitJob).toHaveBeenCalledWith({
      url: "https://example.com/job",
    })
  })
})
