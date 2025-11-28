import { render, screen } from "@testing-library/react"
import { BrowserRouter } from "react-router-dom"
import { MainLayout } from "../MainLayout"
import { vi } from "vitest"

/**
 * MainLayout Component Tests
 */

// Mock the child components
vi.mock("../Navigation", () => ({
  Navigation: () => <div data-testid="navigation">Navigation Component</div>,
}))

vi.mock("../Footer", () => ({
  Footer: () => <div data-testid="footer">Footer Component</div>,
}))

// Mock react-router-dom
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    Outlet: () => <div data-testid="outlet">Outlet Content</div>,
  }
})

describe("MainLayout", () => {
  it("renders all layout components", () => {
    render(
      <BrowserRouter>
        <MainLayout />
      </BrowserRouter>
    )

    expect(screen.getByTestId("navigation")).toBeInTheDocument()
    expect(screen.getByTestId("outlet")).toBeInTheDocument()
    expect(screen.getByTestId("footer")).toBeInTheDocument()
  })

  it("has proper flexbox structure", () => {
    const { container } = render(
      <BrowserRouter>
        <MainLayout />
      </BrowserRouter>
    )

    const rootDiv = container.firstChild
    expect(rootDiv).toHaveClass("min-h-screen", "bg-background/90", "flex", "flex-col")
  })

  it("has proper main content styling", () => {
    render(
      <BrowserRouter>
        <MainLayout />
      </BrowserRouter>
    )

    const main = screen.getByTestId("outlet").parentElement
    expect(main).toHaveClass("container", "mx-auto", "px-4", "py-8", "flex-1")
  })

  it("renders navigation at the top", () => {
    const { container } = render(
      <BrowserRouter>
        <MainLayout />
      </BrowserRouter>
    )

    const rootDiv = container.firstChild as HTMLElement
    const children = Array.from(rootDiv?.children || [])

    expect(children[0]).toContainElement(screen.getByTestId("navigation"))
  })

  it("renders footer at the bottom", () => {
    const { container } = render(
      <BrowserRouter>
        <MainLayout />
      </BrowserRouter>
    )

    const rootDiv = container.firstChild as HTMLElement
    const children = Array.from(rootDiv?.children || [])

    expect(children[children.length - 1]).toContainElement(screen.getByTestId("footer"))
  })

  it("renders outlet between navigation and footer", () => {
    const { container } = render(
      <BrowserRouter>
        <MainLayout />
      </BrowserRouter>
    )

    const rootDiv = container.firstChild as HTMLElement
    const children = Array.from(rootDiv?.children || [])

    const navigation = screen.getByTestId("navigation")
    const outlet = screen.getByTestId("outlet")
    const footer = screen.getByTestId("footer")

    const navigationIndex = children.findIndex((child) => child.contains(navigation))
    const mainIndex = children.findIndex((child) => child.contains(outlet))
    const footerIndex = children.findIndex((child) => child.contains(footer))

    expect(navigationIndex).toBe(0)
    expect(mainIndex).toBe(1)
    expect(footerIndex).toBe(2)
  })

  it("has proper background styling", () => {
    const { container } = render(
      <BrowserRouter>
        <MainLayout />
      </BrowserRouter>
    )

    const rootDiv = container.firstChild
    expect(rootDiv).toHaveClass("bg-background/90")
  })

  it("has minimum height styling", () => {
    const { container } = render(
      <BrowserRouter>
        <MainLayout />
      </BrowserRouter>
    )

    const rootDiv = container.firstChild
    expect(rootDiv).toHaveClass("min-h-screen")
  })
})
