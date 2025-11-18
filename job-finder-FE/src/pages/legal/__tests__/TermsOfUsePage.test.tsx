import { render, screen } from "@testing-library/react"
import { TermsOfUsePage } from "../TermsOfUsePage"
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

describe("TermsOfUsePage", () => {
  beforeEach(() => {
    // Mock current date for consistent testing
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2024-01-01"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("renders the page title", () => {
    render(<TermsOfUsePage />)

    expect(screen.getByText("Terms of Use")).toBeInTheDocument()
  })

  it("displays last updated date", () => {
    render(<TermsOfUsePage />)

    // The date is dynamically generated, so we check for the pattern instead of exact text
    expect(screen.getByText(/Last updated: \d{1,2}\/\d{1,2}\/\d{4}/)).toBeInTheDocument()
  })

  it("renders all main sections", () => {
    render(<TermsOfUsePage />)

    const sections = [
      "1. Acceptance of Terms",
      "2. Use License",
      "3. User Accounts",
      "4. Prohibited Uses",
      "5. Content",
      "6. Termination",
      "7. Disclaimer",
      "8. Limitation of Liability",
      "9. Governing Law",
      "10. Changes to Terms",
      "11. Contact Information",
    ]

    sections.forEach((section) => {
      expect(screen.getByText(section)).toBeInTheDocument()
    })
  })

  it("has proper card structure", () => {
    render(<TermsOfUsePage />)

    expect(screen.getByTestId("card")).toBeInTheDocument()
    expect(screen.getByTestId("card-header")).toBeInTheDocument()
    expect(screen.getByTestId("card-content")).toBeInTheDocument()
    expect(screen.getByTestId("card-title")).toBeInTheDocument()
  })

  it("has proper container styling", () => {
    render(<TermsOfUsePage />)

    const container = screen.getByText("Terms of Use").closest(".container")
    expect(container).toHaveClass("container", "mx-auto", "px-4", "py-8", "max-w-4xl")
  })

  it("contains specific legal content", () => {
    render(<TermsOfUsePage />)

    // Check for key legal phrases
    expect(
      screen.getByText(/By accessing and using the Job Finder App Manager/)
    ).toBeInTheDocument()
    expect(screen.getByText(/Permission is granted to temporarily download/)).toBeInTheDocument()
    expect(screen.getByText(/You may not use our service/)).toBeInTheDocument()
    expect(screen.getByText(/We may terminate or suspend your account/)).toBeInTheDocument()
  })

  it("has proper heading hierarchy", () => {
    render(<TermsOfUsePage />)

    const mainTitle = screen.getByText("Terms of Use")
    expect(mainTitle.tagName).toBe("H1")

    const sectionHeadings = screen.getAllByRole("heading", { level: 2 })
    expect(sectionHeadings).toHaveLength(11)
  })

  it("renders lists properly", () => {
    render(<TermsOfUsePage />)

    const lists = screen.getAllByRole("list")
    expect(lists.length).toBeGreaterThan(0)

    const listItems = screen.getAllByRole("listitem")
    expect(listItems.length).toBeGreaterThan(0)
  })

  it("has proper spacing classes", () => {
    render(<TermsOfUsePage />)

    const cardContent = screen.getByTestId("card-content")
    expect(cardContent).toHaveClass("space-y-6")
  })
})
