import { render, screen } from "@testing-library/react"
import { BrowserRouter } from "react-router-dom"
import { MainLayout } from "../components/layout/MainLayout"
import { vi, beforeEach, describe, it, expect } from "vitest"

// Mock the router to capture navigation
const mockNavigate = vi.fn()
vi.mock("react-router-dom", async () => {
  const actual = (await vi.importActual("react-router-dom")) as any
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    Outlet: () => <div data-testid="page-content">Page Content</div>,
  }
})

// Mock the Navigation component
vi.mock("../components/layout/Navigation", () => ({
  Navigation: () => <div data-testid="navigation">Navigation</div>,
}))

describe("Footer Integration", () => {
  beforeEach(() => {
    mockNavigate.mockClear()
  })

  it("renders footer with all legal links", () => {
    render(
      <BrowserRouter>
        <MainLayout />
      </BrowserRouter>
    )

    // Check that footer is rendered
    expect(screen.getByTestId("footer")).toBeInTheDocument()

    // Check that all legal links are present
    expect(screen.getByRole("link", { name: "Terms of Use" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Cookie Policy" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Disclaimer" })).toBeInTheDocument()
  })

  it("has correct href attributes for legal links", () => {
    render(
      <BrowserRouter>
        <MainLayout />
      </BrowserRouter>
    )

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

  it("has correct href attributes for other links", () => {
    render(
      <BrowserRouter>
        <MainLayout />
      </BrowserRouter>
    )

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
  })

  it("has correct external link attributes", () => {
    render(
      <BrowserRouter>
        <MainLayout />
      </BrowserRouter>
    )

    const contactLink = screen.getByRole("link", { name: "Contact Support" })
    expect(contactLink).toHaveAttribute("href", "mailto:support@jobfinderapp.com")

    const githubLink = screen.getByRole("link", { name: "GitHub" })
    expect(githubLink).toHaveAttribute("href", "https://github.com/your-org/job-finder-app")
    expect(githubLink).toHaveAttribute("target", "_blank")
    expect(githubLink).toHaveAttribute("rel", "noopener noreferrer")
  })

  it("displays company information", () => {
    render(
      <BrowserRouter>
        <MainLayout />
      </BrowserRouter>
    )

    expect(screen.getByText("Job Finder App Manager")).toBeInTheDocument()
    expect(
      screen.getByText(/Streamline your job search with intelligent application management/)
    ).toBeInTheDocument()
  })

  it("displays copyright information", () => {
    render(
      <BrowserRouter>
        <MainLayout />
      </BrowserRouter>
    )

    const currentYear = new Date().getFullYear()
    expect(
      screen.getByText(`© ${currentYear} Job Finder App Manager. All rights reserved.`)
    ).toBeInTheDocument()
  })

  it("displays branding message", () => {
    render(
      <BrowserRouter>
        <MainLayout />
      </BrowserRouter>
    )

    expect(screen.getByText("Made with ❤️ for job seekers")).toBeInTheDocument()
  })

  it("has proper responsive layout structure", () => {
    render(
      <BrowserRouter>
        <MainLayout />
      </BrowserRouter>
    )

    const footer = screen.getByTestId("footer")
    expect(footer).toHaveClass("bg-muted/50", "border-t")

    const container = footer.querySelector(".container")
    expect(container).toHaveClass("container", "mx-auto", "px-4", "py-8")

    const grid = container?.querySelector(".grid")
    expect(grid).toHaveClass("grid", "grid-cols-1", "md:grid-cols-4", "gap-8")
  })

  it("has proper section organization", () => {
    render(
      <BrowserRouter>
        <MainLayout />
      </BrowserRouter>
    )

    const headings = screen.getAllByRole("heading", { level: 3 })
    expect(headings).toHaveLength(4)

    const headingTexts = headings.map((heading) => heading.textContent)
    expect(headingTexts).toContain("Job Finder App Manager")
    expect(headingTexts).toContain("Quick Links")
    expect(headingTexts).toContain("Legal")
    expect(headingTexts).toContain("Support")
  })

  it("has proper accessibility attributes", () => {
    render(
      <BrowserRouter>
        <MainLayout />
      </BrowserRouter>
    )

    const footer = screen.getByRole("contentinfo")
    expect(footer).toBeInTheDocument()

    const links = screen.getAllByRole("link")
    links.forEach((link) => {
      expect(link).toHaveAttribute("href")
    })
  })

  it("maintains layout structure with footer at bottom", () => {
    render(
      <BrowserRouter>
        <MainLayout />
      </BrowserRouter>
    )

    const container = screen.getByTestId("navigation").parentElement
    expect(container).toHaveClass("min-h-screen", "bg-background", "flex", "flex-col")

    const main = screen.getByTestId("page-content").parentElement
    expect(main).toHaveClass("flex-1")
  })

  it("has proper hover states for interactive elements", () => {
    render(
      <BrowserRouter>
        <MainLayout />
      </BrowserRouter>
    )

    const links = screen.getAllByRole("link")
    links.forEach((link) => {
      expect(link).toHaveClass("hover:text-foreground", "transition-colors")
    })
  })
})
