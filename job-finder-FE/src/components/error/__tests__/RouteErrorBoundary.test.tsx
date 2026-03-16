import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi, beforeEach } from "vitest"

const mockUseRouteError = vi.fn()
const mockNavigate = vi.fn()
const mockIsRouteErrorResponse = vi.fn()
const mockIsChunkLoadError = vi.fn()

vi.mock("react-router-dom", () => ({
  useRouteError: () => mockUseRouteError(),
  useNavigate: () => mockNavigate,
  isRouteErrorResponse: (e: unknown) => mockIsRouteErrorResponse(e),
}))

vi.mock("@/lib/lazyWithRetry", () => ({
  isChunkLoadError: (e: unknown) => mockIsChunkLoadError(e),
  RELOAD_KEY: "app-reload-key",
}))

// Must import after mocks
import { RouteErrorBoundary } from "../RouteErrorBoundary"

describe("RouteErrorBoundary", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsRouteErrorResponse.mockReturnValue(false)
    mockIsChunkLoadError.mockReturnValue(false)
  })

  it("renders HTTP error status for route error responses", () => {
    const routeError = { status: 404, statusText: "Not Found", data: {} }
    mockUseRouteError.mockReturnValue(routeError)
    mockIsRouteErrorResponse.mockReturnValue(true)

    render(<RouteErrorBoundary />)

    expect(screen.getByText("404")).toBeInTheDocument()
    expect(screen.getByText("Not Found")).toBeInTheDocument()
    expect(screen.getByText("Go Home")).toBeInTheDocument()
  })

  it("renders chunk load error with update message", () => {
    const chunkError = new Error("Loading chunk failed")
    mockUseRouteError.mockReturnValue(chunkError)
    mockIsChunkLoadError.mockReturnValue(true)

    render(<RouteErrorBoundary />)

    expect(screen.getByText("Update Available")).toBeInTheDocument()
    expect(screen.getByText("Refresh Page")).toBeInTheDocument()
    expect(screen.getByText("Go Home")).toBeInTheDocument()
  })

  it("renders generic error message for unknown errors", () => {
    const error = new Error("Something broke")
    mockUseRouteError.mockReturnValue(error)

    render(<RouteErrorBoundary />)

    expect(screen.getByText("Something went wrong")).toBeInTheDocument()
    expect(screen.getByText("Something broke")).toBeInTheDocument()
    expect(screen.getByText("Try Again")).toBeInTheDocument()
  })

  it("renders fallback message for non-Error objects", () => {
    mockUseRouteError.mockReturnValue("string error")

    render(<RouteErrorBoundary />)

    expect(screen.getByText("Something went wrong")).toBeInTheDocument()
    expect(screen.getByText("An unexpected error occurred")).toBeInTheDocument()
  })
})
