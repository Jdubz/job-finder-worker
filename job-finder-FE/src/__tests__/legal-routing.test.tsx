import { render, screen } from "@testing-library/react"
import { RouterProvider, createMemoryRouter } from "react-router-dom"
import { router } from "../router"
import { vi } from "vitest"

// Mock all the page components
vi.mock("../pages/legal/TermsOfUsePage", () => ({
  TermsOfUsePage: () => <div data-testid="terms-of-use-page">Terms of Use Page</div>,
}))

vi.mock("../pages/legal/PrivacyPolicyPage", () => ({
  PrivacyPolicyPage: () => <div data-testid="privacy-policy-page">Privacy Policy Page</div>,
}))

vi.mock("../pages/legal/CookiePolicyPage", () => ({
  CookiePolicyPage: () => <div data-testid="cookie-policy-page">Cookie Policy Page</div>,
}))

vi.mock("../pages/legal/DisclaimerPage", () => ({
  DisclaimerPage: () => <div data-testid="disclaimer-page">Disclaimer Page</div>,
}))

// Mock other pages to avoid loading them
vi.mock("../pages/HomePage", () => ({
  HomePage: () => <div data-testid="home-page">Home Page</div>,
}))

vi.mock("../pages/how-it-works/HowItWorksPage", () => ({
  HowItWorksPage: () => <div data-testid="how-it-works-page">How It Works Page</div>,
}))

vi.mock("../pages/content-items/ContentItemsPage", () => ({
  ContentItemsPage: () => <div data-testid="content-items-page">Content Items Page</div>,
}))

vi.mock("../pages/document-builder/DocumentBuilderPage", () => ({
  DocumentBuilderPage: () => <div data-testid="document-builder-page">Document Builder Page</div>,
}))

vi.mock("../pages/ai-prompts/AIPromptsPage", () => ({
  AIPromptsPage: () => <div data-testid="ai-prompts-page">AI Prompts Page</div>,
}))

vi.mock("../pages/settings/SettingsPage", () => ({
  SettingsPage: () => <div data-testid="settings-page">Settings Page</div>,
}))

vi.mock("../pages/job-applications/JobApplicationsPage", () => ({
  JobApplicationsPage: () => <div data-testid="job-applications-page">Job Applications Page</div>,
}))

vi.mock("../pages/job-finder/JobFinderPage", () => ({
  JobFinderPage: () => <div data-testid="job-finder-page">Job Finder Page</div>,
}))

vi.mock("../pages/queue-management/QueueManagementPage", () => ({
  QueueManagementPage: () => <div data-testid="queue-management-page">Queue Management Page</div>,
}))

vi.mock("../pages/job-finder-config/JobFinderConfigPage", () => ({
  JobFinderConfigPage: () => <div data-testid="job-finder-config-page">Job Finder Config Page</div>,
}))

vi.mock("../pages/auth/UnauthorizedPage", () => ({
  UnauthorizedPage: () => <div data-testid="unauthorized-page">Unauthorized Page</div>,
}))

// Mock the layout components
vi.mock("../components/layout/MainLayout", () => ({
  MainLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="main-layout">
      <div data-testid="navigation">Navigation</div>
      <main data-testid="main-content">{children}</main>
      <div data-testid="footer">Footer</div>
    </div>
  ),
}))

vi.mock("../components/auth/ProtectedRoute", () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="protected-route">{children}</div>
  ),
}))

// Mock contexts
vi.mock("../contexts/AuthContext", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="auth-provider">{children}</div>
  ),
}))

describe("Legal Page Routing", () => {
  const renderWithRouter = (initialRoute = "/") => {
    const memoryRouter = createMemoryRouter(router.routes, {
      initialEntries: [initialRoute],
    })

    return render(<RouterProvider router={memoryRouter} />)
  }

  it("renders Terms of Use page at /terms-of-use", () => {
    renderWithRouter("/terms-of-use")

    expect(screen.getByTestId("terms-of-use-page")).toBeInTheDocument()
    expect(screen.getByText("Terms of Use Page")).toBeInTheDocument()
  })

  it("renders Privacy Policy page at /privacy-policy", () => {
    renderWithRouter("/privacy-policy")

    expect(screen.getByTestId("privacy-policy-page")).toBeInTheDocument()
    expect(screen.getByText("Privacy Policy Page")).toBeInTheDocument()
  })

  it("renders Cookie Policy page at /cookie-policy", () => {
    renderWithRouter("/cookie-policy")

    expect(screen.getByTestId("cookie-policy-page")).toBeInTheDocument()
    expect(screen.getByText("Cookie Policy Page")).toBeInTheDocument()
  })

  it("renders Disclaimer page at /disclaimer", () => {
    renderWithRouter("/disclaimer")

    expect(screen.getByTestId("disclaimer-page")).toBeInTheDocument()
    expect(screen.getByText("Disclaimer Page")).toBeInTheDocument()
  })

  it("renders MainLayout for all legal pages", () => {
    const routes = ["/terms-of-use", "/privacy-policy", "/cookie-policy", "/disclaimer"]

    routes.forEach((route) => {
      const { unmount } = renderWithRouter(route)

      expect(screen.getByTestId("main-layout")).toBeInTheDocument()
      expect(screen.getByTestId("navigation")).toBeInTheDocument()
      expect(screen.getByTestId("main-content")).toBeInTheDocument()
      expect(screen.getByTestId("footer")).toBeInTheDocument()

      unmount()
    })
  })

  it("legal pages are accessible without authentication", () => {
    const routes = ["/terms-of-use", "/privacy-policy", "/cookie-policy", "/disclaimer"]

    routes.forEach((route) => {
      const { unmount } = renderWithRouter(route)

      // Should not have ProtectedRoute wrapper
      expect(screen.queryByTestId("protected-route")).not.toBeInTheDocument()

      unmount()
    })
  })

  it("redirects unknown routes to home", () => {
    renderWithRouter("/unknown-route")

    expect(screen.getByTestId("home-page")).toBeInTheDocument()
  })

  it("handles nested routing correctly", () => {
    renderWithRouter("/terms-of-use")

    // Should render the page within the layout structure
    expect(screen.getByTestId("main-layout")).toBeInTheDocument()
    expect(screen.getByTestId("terms-of-use-page")).toBeInTheDocument()
  })
})
