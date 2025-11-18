import { render, screen } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { BrowserRouter } from "react-router-dom"
import { HomePage } from "../HomePage"

describe("HomePage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const renderHomePage = () => {
    return render(
      <BrowserRouter>
        <HomePage />
      </BrowserRouter>
    )
  }

  it("should render main heading", () => {
    renderHomePage()

    expect(screen.getByRole("heading", { level: 1, name: /Job Finder/i })).toBeInTheDocument()
  })

  it("should render subtitle description", () => {
    renderHomePage()

    expect(screen.getByText(/AI-powered job discovery and matching platform/i)).toBeInTheDocument()
  })

  it("should render Document Builder feature card", () => {
    renderHomePage()

    expect(screen.getByText("Document Builder")).toBeInTheDocument()
    expect(
      screen.getByText(/Generate custom resumes and cover letters with AI/i)
    ).toBeInTheDocument()
  })

  it("should render Job Applications feature card", () => {
    renderHomePage()

    expect(screen.getByText("Job Applications")).toBeInTheDocument()
    expect(screen.getByText(/Track and manage your job application pipeline/i)).toBeInTheDocument()
  })

  it("should render Smart Matching feature card", () => {
    renderHomePage()

    expect(screen.getByText("Smart Matching")).toBeInTheDocument()
    expect(
      screen.getByText(/AI analyzes job postings to find the best matches/i)
    ).toBeInTheDocument()
  })

  it("should have all three feature cards", () => {
    renderHomePage()

    const cards = screen.getAllByRole("heading", { level: 3 })
    expect(cards).toHaveLength(3)
  })

  it("should have proper grid layout structure", () => {
    const { container } = renderHomePage()

    const grid = container.querySelector(".grid")
    expect(grid).toBeInTheDocument()
    expect(grid).toHaveClass("gap-4", "md:grid-cols-2", "lg:grid-cols-3")
  })

  it("should have proper semantic HTML structure", () => {
    const { container } = renderHomePage()

    expect(container.querySelector("h1")).toBeInTheDocument()
    expect(container.querySelector("p")).toBeInTheDocument()
  })

  it("should render with proper spacing", () => {
    const { container } = renderHomePage()

    const mainContainer = container.firstChild
    expect(mainContainer).toHaveClass("space-y-6")
  })
})
