import { render, screen } from "@testing-library/react"
import { CookiePolicyPage } from "../CookiePolicyPage"
import { vi } from "vitest"

// Mock the UI components
vi.mock("@/components/ui/card", () => ({
  Card: ({ children, ...props }: any) => (
    <div data-testid="card" {...props}>
      {children}
    </div>
  ),
  CardContent: ({ children, ...props }: any) => (
    <div data-testid="card-content" {...props}>
      {children}
    </div>
  ),
  CardHeader: ({ children, ...props }: any) => (
    <div data-testid="card-header" {...props}>
      {children}
    </div>
  ),
  CardTitle: ({ children, ...props }: any) => (
    <h1 data-testid="card-title" {...props}>
      {children}
    </h1>
  ),
}))

describe("CookiePolicyPage", () => {
  beforeEach(() => {
    // Mock current date for consistent testing
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2024-01-01"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("renders the page title", () => {
    render(<CookiePolicyPage />)

    expect(screen.getByText("Cookie Policy")).toBeInTheDocument()
  })

  it("displays last updated date", () => {
    render(<CookiePolicyPage />)

    // The date is dynamically generated, so we check for the pattern instead of exact text
    expect(screen.getByText(/Last updated: \d{1,2}\/\d{1,2}\/\d{4}/)).toBeInTheDocument()
  })

  it("renders all main sections", () => {
    render(<CookiePolicyPage />)

    const sections = [
      "1. What Are Cookies",
      "2. How We Use Cookies",
      "3. Types of Cookies We Use",
      "4. Third-Party Cookies",
      "5. Managing Cookies",
      "6. Impact of Disabling Cookies",
      "7. Cookie Duration",
      "8. Updates to This Policy",
      "9. Contact Us",
    ]

    sections.forEach((section) => {
      expect(screen.getByText(section)).toBeInTheDocument()
    })
  })

  it("renders cookie types subsections", () => {
    render(<CookiePolicyPage />)

    const cookieTypes = [
      "Essential Cookies",
      "Performance Cookies",
      "Functionality Cookies",
      "Analytics Cookies",
    ]

    cookieTypes.forEach((type) => {
      expect(screen.getByText(type)).toBeInTheDocument()
    })
  })

  it("has proper card structure", () => {
    render(<CookiePolicyPage />)

    expect(screen.getByTestId("card")).toBeInTheDocument()
    expect(screen.getByTestId("card-header")).toBeInTheDocument()
    expect(screen.getByTestId("card-content")).toBeInTheDocument()
    expect(screen.getByTestId("card-title")).toBeInTheDocument()
  })

  it("contains specific cookie content", () => {
    render(<CookiePolicyPage />)

    // Check for key cookie phrases
    expect(screen.getByText(/Cookies are small text files that are placed/)).toBeInTheDocument()
    expect(screen.getByText(/We use cookies to/)).toBeInTheDocument()
    expect(screen.getByText(/You can control and manage cookies/)).toBeInTheDocument()
    expect(screen.getByText(/If you choose to disable cookies/)).toBeInTheDocument()
  })

  it("has proper heading hierarchy", () => {
    render(<CookiePolicyPage />)

    const mainTitle = screen.getByText("Cookie Policy")
    expect(mainTitle.tagName).toBe("H1")

    const sectionHeadings = screen.getAllByRole("heading", { level: 2 })
    expect(sectionHeadings).toHaveLength(9)

    const subHeadings = screen.getAllByRole("heading", { level: 3 })
    expect(subHeadings).toHaveLength(4) // Cookie types
  })

  it("renders cookie usage list items", () => {
    render(<CookiePolicyPage />)

    expect(screen.getByText("Remember your preferences and settings")).toBeInTheDocument()
    expect(screen.getByText("Keep you signed in to your account")).toBeInTheDocument()
    expect(screen.getByText("Understand how you use our website")).toBeInTheDocument()
    expect(screen.getByText("Improve our services and user experience")).toBeInTheDocument()
  })

  it("renders cookie management list items", () => {
    render(<CookiePolicyPage />)

    expect(
      screen.getByText("Browser settings: Most browsers allow you to refuse or accept cookies")
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        "Cookie preferences: Use our cookie preference center to manage your choices"
      )
    ).toBeInTheDocument()
    expect(
      screen.getByText("Opt-out tools: Use industry opt-out tools for advertising cookies")
    ).toBeInTheDocument()
  })

  it("has proper container styling", () => {
    render(<CookiePolicyPage />)

    const container = screen.getByText("Cookie Policy").closest(".container")
    expect(container).toHaveClass("container", "mx-auto", "px-4", "py-8", "max-w-4xl")
  })
})
