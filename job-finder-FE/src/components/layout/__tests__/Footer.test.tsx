import { render, screen } from "@testing-library/react"
import { BrowserRouter } from "react-router-dom"
import { Footer } from "../Footer"
import { vi } from "vitest"

// Mock the ROUTES import
vi.mock("@/types/routes", () => ({
  ROUTES: {
    HOME: "/",
    HOW_IT_WORKS: "/how-it-works",
    CONTENT_ITEMS: "/content-items",
    DOCUMENT_BUILDER: "/document-builder",
    SETTINGS: "/settings",
    TERMS_OF_USE: "/terms-of-use",
    PRIVACY_POLICY: "/privacy-policy",
    COOKIE_POLICY: "/cookie-policy",
    DISCLAIMER: "/disclaimer",
  },
}))

const renderFooter = () => {
  return render(
    <BrowserRouter>
      <Footer />
    </BrowserRouter>
  )
}

describe("Footer", () => {
  beforeEach(() => {
    // Mock current year for consistent testing
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2024-01-01"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("renders footer with company information", () => {
    renderFooter()

    expect(screen.getByText("Job Finder App Manager")).toBeInTheDocument()
    expect(
      screen.getByText(/Streamline your job search with intelligent application management/)
    ).toBeInTheDocument()
  })

  it("renders quick links section", () => {
    renderFooter()

    expect(screen.getByText("Quick Links")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Home" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "How It Works" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Content Items" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Document Builder" })).toBeInTheDocument()
  })

  it("renders legal links section", () => {
    renderFooter()

    expect(screen.getByText("Legal")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Terms of Use" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Cookie Policy" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Disclaimer" })).toBeInTheDocument()
  })

  it("renders support section", () => {
    renderFooter()

    expect(screen.getByText("Support")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Settings" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Contact Support" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "GitHub" })).toBeInTheDocument()
  })

  it("has correct href attributes for internal links", () => {
    renderFooter()

    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/")
    expect(screen.getByRole("link", { name: "How It Works" })).toHaveAttribute(
      "href",
      "/how-it-works"
    )
    expect(screen.getByRole("link", { name: "Content Items" })).toHaveAttribute(
      "href",
      "/content-items"
    )
    expect(screen.getByRole("link", { name: "Document Builder" })).toHaveAttribute(
      "href",
      "/document-builder"
    )
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings")
    expect(screen.getByRole("link", { name: "Terms of Use" })).toHaveAttribute(
      "href",
      "/terms-of-use"
    )
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute(
      "href",
      "/privacy-policy"
    )
    expect(screen.getByRole("link", { name: "Cookie Policy" })).toHaveAttribute(
      "href",
      "/cookie-policy"
    )
    expect(screen.getByRole("link", { name: "Disclaimer" })).toHaveAttribute("href", "/disclaimer")
  })

  it("has correct href attributes for external links", () => {
    renderFooter()

    const contactLink = screen.getByRole("link", { name: "Contact Support" })
    expect(contactLink).toHaveAttribute("href", "mailto:support@jobfinderapp.com")

    const githubLink = screen.getByRole("link", { name: "GitHub" })
    expect(githubLink).toHaveAttribute("href", "https://github.com/your-org/job-finder-app")
    expect(githubLink).toHaveAttribute("target", "_blank")
    expect(githubLink).toHaveAttribute("rel", "noopener noreferrer")
  })

  it("displays current year in copyright notice", () => {
    renderFooter()

    // The year is dynamically generated, so we check for the pattern instead of exact text
    expect(
      screen.getByText(/© \d{4} Job Finder App Manager\. All rights reserved\./)
    ).toBeInTheDocument()
  })

  it("displays branding message", () => {
    renderFooter()

    expect(screen.getByText("Made with ❤️ for job seekers")).toBeInTheDocument()
  })

  it("has proper responsive classes", () => {
    renderFooter()

    const footer = screen.getByRole("contentinfo")
    expect(footer).toHaveClass("bg-muted/50", "border-t")

    const container = footer.querySelector(".container")
    expect(container).toHaveClass("container", "mx-auto", "px-4", "py-8")

    const grid = container?.querySelector(".grid")
    expect(grid).toHaveClass("grid", "grid-cols-1", "md:grid-cols-4", "gap-8")
  })

  it("has proper accessibility attributes", () => {
    renderFooter()

    const footer = screen.getByRole("contentinfo")
    expect(footer).toBeInTheDocument()

    // Check that all links are properly accessible
    const links = screen.getAllByRole("link")
    links.forEach((link) => {
      expect(link).toHaveAttribute("href")
    })
  })

  it("renders all sections with proper headings", () => {
    renderFooter()

    const headings = screen.getAllByRole("heading", { level: 3 })
    expect(headings).toHaveLength(4)

    const headingTexts = headings.map((heading) => heading.textContent)
    expect(headingTexts).toContain("Job Finder App Manager")
    expect(headingTexts).toContain("Quick Links")
    expect(headingTexts).toContain("Legal")
    expect(headingTexts).toContain("Support")
  })

  it("has proper hover states for links", () => {
    renderFooter()

    const links = screen.getAllByRole("link")
    links.forEach((link) => {
      expect(link).toHaveClass("hover:text-foreground", "transition-colors")
    })
  })
})
