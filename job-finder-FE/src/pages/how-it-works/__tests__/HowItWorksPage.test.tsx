import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { BrowserRouter } from "react-router-dom"
import { HowItWorksPage } from "../HowItWorksPage"

function renderPage() {
  return render(
    <BrowserRouter>
      <HowItWorksPage />
    </BrowserRouter>
  )
}

describe("HowItWorksPage", () => {
  it("renders the page title", () => {
    renderPage()
    expect(screen.getByText("How Job Finder Works")).toBeInTheDocument()
  })

  it("renders the hero description", () => {
    renderPage()
    expect(
      screen.getByText(/We turn your open role into a short list of tailored applicant materials/)
    ).toBeInTheDocument()
  })

  it("renders the three promise cards", () => {
    renderPage()
    expect(screen.getByText("Clear Inputs")).toBeInTheDocument()
    expect(screen.getByText("Ranked Matches")).toBeInTheDocument()
    expect(screen.getByText("Ready-to-Share Docs")).toBeInTheDocument()
  })

  it("renders the three workflow steps", () => {
    renderPage()
    expect(screen.getByText("Step 1")).toBeInTheDocument()
    expect(screen.getByText("Step 2")).toBeInTheDocument()
    expect(screen.getByText("Step 3")).toBeInTheDocument()
    expect(screen.getByText("Capture the role")).toBeInTheDocument()
    expect(screen.getByText("Align to the candidate")).toBeInTheDocument()
    expect(screen.getByText("Deliver tailored materials")).toBeInTheDocument()
  })

  it("renders the features section", () => {
    renderPage()
    expect(screen.getByText("Matches")).toBeInTheDocument()
    expect(screen.getByText("Career Story")).toBeInTheDocument()
    expect(screen.getByText("Document Builder")).toBeInTheDocument()
  })

  it("renders quality and access section", () => {
    renderPage()
    expect(screen.getByText("Quality & access")).toBeInTheDocument()
    expect(screen.getByText("Sign-in required")).toBeInTheDocument()
    expect(screen.getByText("Traceable queue")).toBeInTheDocument()
    expect(screen.getByText("Editable inputs")).toBeInTheDocument()
  })

  it("renders CTA section with links", () => {
    renderPage()
    expect(screen.getByText("Want to see a sample packet?")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /View Matches/i })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Build a Packet/i })).toBeInTheDocument()
  })

  it("has correct href for Document Builder link", () => {
    renderPage()
    const builderLink = screen.getByRole("link", { name: /Open the builder/i })
    expect(builderLink).toHaveAttribute("href", "/document-builder")
  })
})
