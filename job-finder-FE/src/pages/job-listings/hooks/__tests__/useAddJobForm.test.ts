import { renderHook, act } from "@testing-library/react"
import { describe, expect, it, vi, beforeEach } from "vitest"
import { useAddJobForm } from "../useAddJobForm"

const mockNavigate = vi.fn()
const mockSubmitJob = vi.fn()

vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}))

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
      jobTitle: "",
      jobDescription: "",
      jobLocation: "",
      jobTechStack: "",
      bypassFilter: false,
      companyName: "",
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

    act(() => {
      result.current.setField("jobTitle", "Software Engineer")
    })
    expect(result.current.formState.jobTitle).toBe("Software Engineer")

    act(() => {
      result.current.setField("bypassFilter", true)
    })
    expect(result.current.formState.bypassFilter).toBe(true)
  })

  it("resets form to initial state", () => {
    const { result } = renderHook(() => useAddJobForm())

    act(() => {
      result.current.setField("jobUrl", "https://example.com/job")
      result.current.setField("jobTitle", "Test Title")
    })

    expect(result.current.formState.jobUrl).toBe("https://example.com/job")

    act(() => {
      result.current.resetForm()
    })

    expect(result.current.formState).toEqual({
      jobUrl: "",
      jobTitle: "",
      jobDescription: "",
      jobLocation: "",
      jobTechStack: "",
      bypassFilter: false,
      companyName: "",
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

  it("validates required fields - missing title", async () => {
    const { result } = renderHook(() => useAddJobForm())

    act(() => {
      result.current.setField("jobUrl", "https://example.com/job")
    })

    const mockEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent

    await act(async () => {
      await result.current.handleSubmit(mockEvent)
    })

    expect(result.current.submitError).toBe("Job title is required")
    expect(mockSubmitJob).not.toHaveBeenCalled()
  })

  it("validates required fields - missing description", async () => {
    const { result } = renderHook(() => useAddJobForm())

    act(() => {
      result.current.setField("jobUrl", "https://example.com/job")
      result.current.setField("jobTitle", "Software Engineer")
    })

    const mockEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent

    await act(async () => {
      await result.current.handleSubmit(mockEvent)
    })

    expect(result.current.submitError).toBe("Job description is required")
    expect(mockSubmitJob).not.toHaveBeenCalled()
  })

  it("submits form successfully", async () => {
    mockSubmitJob.mockResolvedValue({ id: "job-123" })

    const { result } = renderHook(() => useAddJobForm())

    act(() => {
      result.current.setField("jobUrl", "https://example.com/job")
      result.current.setField("jobTitle", "Software Engineer")
      result.current.setField("jobDescription", "Build cool stuff")
      result.current.setField("companyName", "Acme Corp")
      result.current.setField("jobLocation", "Remote")
      result.current.setField("bypassFilter", true)
    })

    const mockEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent

    await act(async () => {
      await result.current.handleSubmit(mockEvent)
    })

    expect(mockSubmitJob).toHaveBeenCalledWith({
      url: "https://example.com/job",
      title: "Software Engineer",
      description: "Build cool stuff",
      companyName: "Acme Corp",
      location: "Remote",
      techStack: undefined,
      bypassFilter: true,
    })

    expect(result.current.submitError).toBeNull()
    expect(result.current.isModalOpen).toBe(false)
    expect(mockNavigate).toHaveBeenCalledWith("/queue-management")
  })

  it("handles submission error", async () => {
    mockSubmitJob.mockRejectedValue(new Error("Server error"))

    const { result } = renderHook(() => useAddJobForm())

    act(() => {
      result.current.setField("jobUrl", "https://example.com/job")
      result.current.setField("jobTitle", "Software Engineer")
      result.current.setField("jobDescription", "Build cool stuff")
    })

    const mockEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent

    await act(async () => {
      await result.current.handleSubmit(mockEvent)
    })

    expect(result.current.submitError).toBe("Server error")
    expect(result.current.isSubmitting).toBe(false)
    expect(mockNavigate).not.toHaveBeenCalled()
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
      result.current.setField("jobTitle", "Test Job")
    })

    expect(result.current.formState.jobUrl).toBe("https://example.com/job")

    act(() => {
      result.current.setIsModalOpen(false)
    })

    expect(result.current.formState.jobUrl).toBe("")
    expect(result.current.formState.jobTitle).toBe("")
  })

  it("trims whitespace from form values on submit", async () => {
    mockSubmitJob.mockResolvedValue({ id: "job-123" })

    const { result } = renderHook(() => useAddJobForm())

    act(() => {
      result.current.setField("jobUrl", "  https://example.com/job  ")
      result.current.setField("jobTitle", "  Software Engineer  ")
      result.current.setField("jobDescription", "  Build cool stuff  ")
    })

    const mockEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent

    await act(async () => {
      await result.current.handleSubmit(mockEvent)
    })

    expect(mockSubmitJob).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://example.com/job",
        title: "Software Engineer",
        description: "Build cool stuff",
      })
    )
  })

  it("omits empty optional fields from payload", async () => {
    mockSubmitJob.mockResolvedValue({ id: "job-123" })

    const { result } = renderHook(() => useAddJobForm())

    act(() => {
      result.current.setField("jobUrl", "https://example.com/job")
      result.current.setField("jobTitle", "Software Engineer")
      result.current.setField("jobDescription", "Build cool stuff")
      // Leave optional fields empty
    })

    const mockEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent

    await act(async () => {
      await result.current.handleSubmit(mockEvent)
    })

    expect(mockSubmitJob).toHaveBeenCalledWith({
      url: "https://example.com/job",
      title: "Software Engineer",
      description: "Build cool stuff",
      companyName: undefined,
      location: undefined,
      techStack: undefined,
      bypassFilter: false,
    })
  })
})
