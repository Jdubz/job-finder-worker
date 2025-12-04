import { render, screen } from "@testing-library/react"
import { PrivacyPolicyPage } from "../PrivacyPolicyPage"
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

describe("PrivacyPolicyPage", () => {
  beforeEach(() => {
    // Mock current date for consistent testing
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2024-01-01"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("renders the page title", () => {
    render(<PrivacyPolicyPage />)

    expect(screen.getByText("Privacy Policy")).toBeInTheDocument()
  })

  it("displays last updated date", () => {
    render(<PrivacyPolicyPage />)

    // The date is dynamically generated, so we check for the pattern instead of exact text
    expect(screen.getByText(/Last updated: \d{1,2}\/\d{1,2}\/\d{4}/)).toBeInTheDocument()
  })

  it("renders all main sections", () => {
    render(<PrivacyPolicyPage />)

    const sections = [
      "1. Information We Collect",
      "2. How We Use Your Information",
      "3. Information Sharing and Disclosure",
      "4. Data Security",
      "5. Data Retention",
      "6. Cookies and Tracking Technologies",
      "7. Third-Party Services",
      "8. Your Rights and Choices",
      "9. Children's Privacy",
      "10. International Data Transfers",
      "11. Changes to This Privacy Policy",
      "12. Contact Us",
    ]

    sections.forEach((section) => {
      expect(screen.getByText(section)).toBeInTheDocument()
    })
  })

  it("has proper card structure", () => {
    render(<PrivacyPolicyPage />)

    expect(screen.getByTestId("card")).toBeInTheDocument()
    expect(screen.getByTestId("card-header")).toBeInTheDocument()
    expect(screen.getByTestId("card-content")).toBeInTheDocument()
    expect(screen.getByTestId("card-title")).toBeInTheDocument()
  })

  it("contains specific privacy content", () => {
    render(<PrivacyPolicyPage />)

    // Check for key privacy phrases
    expect(
      screen.getByText(/We collect information you provide directly to us/)
    ).toBeInTheDocument()
    expect(screen.getByText(/We use the information we collect to/)).toBeInTheDocument()
    expect(screen.getByText(/We do not sell, trade, or otherwise transfer/)).toBeInTheDocument()
    expect(
      screen.getByText(/We implement appropriate technical and organizational/)
    ).toBeInTheDocument()
  })

  it("has proper heading hierarchy", () => {
    render(<PrivacyPolicyPage />)

    const mainTitle = screen.getByText("Privacy Policy")
    expect(mainTitle.tagName).toBe("H1")

    const sectionHeadings = screen.getAllByRole("heading", { level: 2 })
    expect(sectionHeadings).toHaveLength(12)
  })

  it("renders data collection list items", () => {
    render(<PrivacyPolicyPage />)

    expect(
      screen.getByText("Personal information (name, email address, phone number)")
    ).toBeInTheDocument()
    expect(screen.getByText("Account credentials and profile information")).toBeInTheDocument()
    expect(screen.getByText("Job search preferences and application data")).toBeInTheDocument()
  })

  it("renders usage list items", () => {
    render(<PrivacyPolicyPage />)

    expect(screen.getByText("Provide, maintain, and improve our services")).toBeInTheDocument()
    expect(
      screen.getByText("Process transactions and send related information")
    ).toBeInTheDocument()
    expect(
      screen.getByText("Send technical notices, updates, and support messages")
    ).toBeInTheDocument()
  })

  it("renders user rights list items", () => {
    render(<PrivacyPolicyPage />)

    expect(screen.getByText("Access and update your personal information")).toBeInTheDocument()
    expect(screen.getByText("Request deletion of your personal information")).toBeInTheDocument()
    expect(screen.getByText("Opt-out of certain communications")).toBeInTheDocument()
  })

  it("has proper container styling", () => {
    render(<PrivacyPolicyPage />)

    const container = screen.getByText("Privacy Policy").closest(".container")
    expect(container).toHaveClass("container", "mx-auto", "px-4", "py-8", "max-w-4xl")
  })
})
