import { render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { describe, expect, it, vi, beforeEach } from "vitest"
import { ProtectedRoute } from "../ProtectedRoute"

const mockUseAuth = vi.fn()

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}))

vi.mock("@/types/routes", () => ({
  ROUTES: {
    UNAUTHORIZED: "/unauthorized",
    HOME: "/",
  },
}))

function renderWithRouter(
  props: Parameters<typeof ProtectedRoute>[0] = {},
  initialPath = "/protected"
) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route element={<ProtectedRoute {...props} />}>
          <Route path="/protected" element={<div>Protected Content</div>} />
        </Route>
        <Route path="/unauthorized" element={<div>Unauthorized Page</div>} />
        <Route path="/login" element={<div>Login Page</div>} />
        <Route path="/" element={<div>Home Page</div>} />
      </Routes>
    </MemoryRouter>
  )
}

describe("ProtectedRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("shows loading state while auth check is pending", () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true, isOwner: false })

    renderWithRouter()

    expect(screen.getByText("Loading...")).toBeInTheDocument()
  })

  it("renders protected content for authenticated users", () => {
    mockUseAuth.mockReturnValue({
      user: { email: "test@example.com" },
      loading: false,
      isOwner: false,
    })

    renderWithRouter()

    expect(screen.getByText("Protected Content")).toBeInTheDocument()
  })

  it("redirects unauthenticated users to unauthorized by default", () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false, isOwner: false })

    renderWithRouter()

    expect(screen.getByText("Unauthorized Page")).toBeInTheDocument()
  })

  it("redirects unauthenticated users to custom unauthRedirectTo", () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false, isOwner: false })

    renderWithRouter({ unauthRedirectTo: "/login" })

    expect(screen.getByText("Login Page")).toBeInTheDocument()
  })

  it("redirects non-owner users when requireOwner is true", () => {
    mockUseAuth.mockReturnValue({
      user: { email: "viewer@example.com" },
      loading: false,
      isOwner: false,
    })

    renderWithRouter({ requireOwner: true })

    expect(screen.getByText("Unauthorized Page")).toBeInTheDocument()
  })

  it("allows owner access when requireOwner is true", () => {
    mockUseAuth.mockReturnValue({
      user: { email: "owner@example.com" },
      loading: false,
      isOwner: true,
    })

    renderWithRouter({ requireOwner: true })

    expect(screen.getByText("Protected Content")).toBeInTheDocument()
  })
})
