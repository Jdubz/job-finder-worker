/**
 * Card Component Tests
 *
 * Comprehensive tests for the Card component functionality
 */

import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "../card"

describe("Card", () => {
  describe("rendering", () => {
    it("should render card with default props", () => {
      render(<Card>Card content</Card>)

      const card = screen.getByText("Card content")
      expect(card).toBeInTheDocument()
    })

    it("should render card with custom className", () => {
      render(<Card className="custom-class">Card content</Card>)

      const card = screen.getByText("Card content")
      expect(card).toHaveClass("custom-class")
    })

    it("should render card with children", () => {
      render(
        <Card>
          <div data-testid="child">Child content</div>
        </Card>
      )

      expect(screen.getByTestId("child")).toBeInTheDocument()
    })

    it("should render card with multiple children", () => {
      render(
        <Card>
          <div data-testid="child1">Child 1</div>
          <div data-testid="child2">Child 2</div>
        </Card>
      )

      expect(screen.getByTestId("child1")).toBeInTheDocument()
      expect(screen.getByTestId("child2")).toBeInTheDocument()
    })
  })

  describe("styling", () => {
    it("should have correct base classes", () => {
      render(<Card>Card content</Card>)

      const card = screen.getByText("Card content")
      expect(card).toHaveClass("rounded-xl", "border", "bg-card", "text-card-foreground", "shadow")
    })

    it("should apply custom className alongside base classes", () => {
      render(<Card className="custom-class">Card content</Card>)

      const card = screen.getByText("Card content")
      expect(card).toHaveClass("custom-class")
      expect(card).toHaveClass("rounded-xl", "border", "bg-card")
    })
  })

  describe("ref forwarding", () => {
    it("should forward ref correctly", () => {
      const ref = vi.fn()

      render(<Card ref={ref}>Card content</Card>)

      expect(ref).toHaveBeenCalledWith(expect.any(HTMLDivElement))
    })
  })

  describe("accessibility", () => {
    it("should support custom ARIA attributes", () => {
      render(
        <Card role="article" aria-label="Test card">
          Card content
        </Card>
      )

      const card = screen.getByRole("article")
      expect(card).toHaveAttribute("aria-label", "Test card")
    })
  })
})

describe("CardHeader", () => {
  describe("rendering", () => {
    it("should render card header with default props", () => {
      render(<CardHeader>Header content</CardHeader>)

      const header = screen.getByText("Header content")
      expect(header).toBeInTheDocument()
    })

    it("should render card header with custom className", () => {
      render(<CardHeader className="custom-class">Header content</CardHeader>)

      const header = screen.getByText("Header content")
      expect(header).toHaveClass("custom-class")
    })
  })

  describe("styling", () => {
    it("should have correct base classes", () => {
      render(<CardHeader>Header content</CardHeader>)

      const header = screen.getByText("Header content")
      expect(header).toHaveClass("flex", "flex-col", "space-y-1.5", "p-6")
    })
  })

  describe("ref forwarding", () => {
    it("should forward ref correctly", () => {
      const ref = vi.fn()

      render(<CardHeader ref={ref}>Header content</CardHeader>)

      expect(ref).toHaveBeenCalledWith(expect.any(HTMLDivElement))
    })
  })
})

describe("CardTitle", () => {
  describe("rendering", () => {
    it("should render card title with default props", () => {
      render(<CardTitle>Title content</CardTitle>)

      const title = screen.getByText("Title content")
      expect(title).toBeInTheDocument()
    })

    it("should render card title with custom className", () => {
      render(<CardTitle className="custom-class">Title content</CardTitle>)

      const title = screen.getByText("Title content")
      expect(title).toHaveClass("custom-class")
    })
  })

  describe("styling", () => {
    it("should have correct base classes", () => {
      render(<CardTitle>Title content</CardTitle>)

      const title = screen.getByText("Title content")
      expect(title).toHaveClass("font-semibold", "leading-none", "tracking-tight")
    })
  })

  describe("ref forwarding", () => {
    it("should forward ref correctly", () => {
      const ref = vi.fn()

      render(<CardTitle ref={ref}>Title content</CardTitle>)

      expect(ref).toHaveBeenCalledWith(expect.any(HTMLDivElement))
    })
  })
})

describe("CardDescription", () => {
  describe("rendering", () => {
    it("should render card description with default props", () => {
      render(<CardDescription>Description content</CardDescription>)

      const description = screen.getByText("Description content")
      expect(description).toBeInTheDocument()
    })

    it("should render card description with custom className", () => {
      render(<CardDescription className="custom-class">Description content</CardDescription>)

      const description = screen.getByText("Description content")
      expect(description).toHaveClass("custom-class")
    })
  })

  describe("styling", () => {
    it("should have correct base classes", () => {
      render(<CardDescription>Description content</CardDescription>)

      const description = screen.getByText("Description content")
      expect(description).toHaveClass("text-sm", "text-muted-foreground")
    })
  })

  describe("ref forwarding", () => {
    it("should forward ref correctly", () => {
      const ref = vi.fn()

      render(<CardDescription ref={ref}>Description content</CardDescription>)

      expect(ref).toHaveBeenCalledWith(expect.any(HTMLDivElement))
    })
  })
})

describe("CardContent", () => {
  describe("rendering", () => {
    it("should render card content with default props", () => {
      render(<CardContent>Content</CardContent>)

      const content = screen.getByText("Content")
      expect(content).toBeInTheDocument()
    })

    it("should render card content with custom className", () => {
      render(<CardContent className="custom-class">Content</CardContent>)

      const content = screen.getByText("Content")
      expect(content).toHaveClass("custom-class")
    })
  })

  describe("styling", () => {
    it("should have correct base classes", () => {
      render(<CardContent>Content</CardContent>)

      const content = screen.getByText("Content")
      expect(content).toHaveClass("p-6", "pt-0")
    })
  })

  describe("ref forwarding", () => {
    it("should forward ref correctly", () => {
      const ref = vi.fn()

      render(<CardContent ref={ref}>Content</CardContent>)

      expect(ref).toHaveBeenCalledWith(expect.any(HTMLDivElement))
    })
  })
})

describe("CardFooter", () => {
  describe("rendering", () => {
    it("should render card footer with default props", () => {
      render(<CardFooter>Footer content</CardFooter>)

      const footer = screen.getByText("Footer content")
      expect(footer).toBeInTheDocument()
    })

    it("should render card footer with custom className", () => {
      render(<CardFooter className="custom-class">Footer content</CardFooter>)

      const footer = screen.getByText("Footer content")
      expect(footer).toHaveClass("custom-class")
    })
  })

  describe("styling", () => {
    it("should have correct base classes", () => {
      render(<CardFooter>Footer content</CardFooter>)

      const footer = screen.getByText("Footer content")
      expect(footer).toHaveClass("flex", "items-center", "p-6", "pt-0")
    })
  })

  describe("ref forwarding", () => {
    it("should forward ref correctly", () => {
      const ref = vi.fn()

      render(<CardFooter ref={ref}>Footer content</CardFooter>)

      expect(ref).toHaveBeenCalledWith(expect.any(HTMLDivElement))
    })
  })
})

describe("Card composition", () => {
  it("should render complete card structure", () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Test Title</CardTitle>
          <CardDescription>Test Description</CardDescription>
        </CardHeader>
        <CardContent>Test Content</CardContent>
        <CardFooter>Test Footer</CardFooter>
      </Card>
    )

    expect(screen.getByText("Test Title")).toBeInTheDocument()
    expect(screen.getByText("Test Description")).toBeInTheDocument()
    expect(screen.getByText("Test Content")).toBeInTheDocument()
    expect(screen.getByText("Test Footer")).toBeInTheDocument()
  })

  it("should maintain proper hierarchy", () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Title</CardTitle>
          <CardDescription>Description</CardDescription>
        </CardHeader>
        <CardContent>Content</CardContent>
        <CardFooter>Footer</CardFooter>
      </Card>
    )

    const card = screen.getByText("Title").closest('[class*="rounded-xl"]')
    expect(card).toBeInTheDocument()
  })
})
