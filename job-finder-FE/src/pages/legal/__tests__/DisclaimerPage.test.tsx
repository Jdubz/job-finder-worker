import { render, screen } from "@testing-library/react"
import { DisclaimerPage } from "../DisclaimerPage"
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

describe("DisclaimerPage", () => {
  beforeEach(() => {
    // Mock current date for consistent testing
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2024-01-01"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("renders the page title", () => {
    render(<DisclaimerPage />)

    expect(screen.getByText("Disclaimer")).toBeInTheDocument()
  })

  it("displays last updated date", () => {
    render(<DisclaimerPage />)

    // The date is dynamically generated, so we check for the pattern instead of exact text
    expect(screen.getByText(/Last updated: \d{1,2}\/\d{1,2}\/\d{4}/)).toBeInTheDocument()
  })

  it("renders all main sections", () => {
    render(<DisclaimerPage />)

    const sections = [
      "1. General Information",
      "2. No Warranty",
      "3. Accuracy of Information",
      "4. Job Search Results",
      "5. Third-Party Content",
      "6. Limitation of Liability",
      "7. Professional Advice",
      "8. Service Availability",
      "9. User Responsibility",
      "10. Changes to Disclaimer",
      "11. Contact Information",
    ]

    sections.forEach((section) => {
      expect(screen.getByText(section)).toBeInTheDocument()
    })
  })

  it("has proper card structure", () => {
    render(<DisclaimerPage />)

    expect(screen.getByTestId("card")).toBeInTheDocument()
    expect(screen.getByTestId("card-header")).toBeInTheDocument()
    expect(screen.getByTestId("card-content")).toBeInTheDocument()
    expect(screen.getByTestId("card-title")).toBeInTheDocument()
  })

  it("contains specific disclaimer content", () => {
    render(<DisclaimerPage />)

    // Check for key disclaimer phrases
    expect(
      screen.getByText(/The information on this website is provided on an "as is" basis/)
    ).toBeInTheDocument()
    expect(screen.getByText(/We make no warranties, expressed or implied/)).toBeInTheDocument()

    // Multiple elements contain "We do not guarantee", so check that at least one exists
    const guaranteeElements = screen.getAllByText(/We do not guarantee/)
    expect(guaranteeElements.length).toBeGreaterThan(0)

    expect(screen.getByText(/Users are responsible for/)).toBeInTheDocument()
  })

  it("has proper heading hierarchy", () => {
    render(<DisclaimerPage />)

    const mainTitle = screen.getByText("Disclaimer")
    expect(mainTitle.tagName).toBe("H1")

    const sectionHeadings = screen.getAllByRole("heading", { level: 2 })
    expect(sectionHeadings).toHaveLength(11)
  })

  it("renders job search guarantees list items", () => {
    render(<DisclaimerPage />)

    expect(screen.getByText("Job availability or accuracy of job postings")).toBeInTheDocument()
    expect(screen.getByText("Success in job applications or interviews")).toBeInTheDocument()
    expect(screen.getByText("Employment opportunities or job offers")).toBeInTheDocument()
    expect(
      screen.getByText("Compatibility with specific employers or positions")
    ).toBeInTheDocument()
  })

  it("renders user responsibility list items", () => {
    render(<DisclaimerPage />)

    expect(
      screen.getByText("Verifying the accuracy of information before acting on it")
    ).toBeInTheDocument()
    expect(screen.getByText("Conducting their own research and due diligence")).toBeInTheDocument()
    expect(
      screen.getByText("Making informed decisions about their career and job search")
    ).toBeInTheDocument()
    expect(screen.getByText("Complying with applicable laws and regulations")).toBeInTheDocument()
  })

  it("has proper container styling", () => {
    render(<DisclaimerPage />)

    const container = screen.getByText("Disclaimer").closest(".container")
    expect(container).toHaveClass("container", "mx-auto", "px-4", "py-8", "max-w-4xl")
  })

  it("renders liability limitation content", () => {
    render(<DisclaimerPage />)

    expect(screen.getByText(/In no event shall Job Finder App Manager/)).toBeInTheDocument()
    expect(screen.getByText(/be liable for any indirect, incidental, special/)).toBeInTheDocument()
  })
})
