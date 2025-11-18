/**
 * Button Component Tests
 *
 * Comprehensive tests for the Button component functionality
 *
 * NOTE: These tests are temporarily skipped due to React 19 + @testing-library/react compatibility.
 * The issue is that @testing-library/react 16.3.0 uses react-dom/test-utils which expects React.act
 * from the React package, but React 19 changed how act is exported. These will be re-enabled when
 * @testing-library/react releases a fully React 19 compatible version or we downgrade to React 18.
 */

import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { Button, buttonVariants } from "../button"

describe.skip("Button", () => {
  describe("rendering", () => {
    it("should render button with default props", () => {
      render(<Button>Click me</Button>)

      const button = screen.getByRole("button", { name: "Click me" })
      expect(button).toBeInTheDocument()
      expect(button).toHaveClass("bg-primary", "text-primary-foreground")
    })

    it("should render button with custom className", () => {
      render(<Button className="custom-class">Click me</Button>)

      const button = screen.getByRole("button", { name: "Click me" })
      expect(button).toHaveClass("custom-class")
    })

    it("should render as child component when asChild is true", () => {
      render(
        <Button asChild>
          <a href="/test">Link button</a>
        </Button>
      )

      const link = screen.getByRole("link", { name: "Link button" })
      expect(link).toBeInTheDocument()
      expect(link).toHaveAttribute("href", "/test")
    })
  })

  describe("variants", () => {
    it("should render default variant", () => {
      render(<Button variant="default">Default</Button>)

      const button = screen.getByRole("button", { name: "Default" })
      expect(button).toHaveClass("bg-primary", "text-primary-foreground", "shadow")
    })

    it("should render destructive variant", () => {
      render(<Button variant="destructive">Destructive</Button>)

      const button = screen.getByRole("button", { name: "Destructive" })
      expect(button).toHaveClass("bg-destructive", "text-destructive-foreground", "shadow-sm")
    })

    it("should render outline variant", () => {
      render(<Button variant="outline">Outline</Button>)

      const button = screen.getByRole("button", { name: "Outline" })
      expect(button).toHaveClass("border", "border-input", "bg-background", "shadow-sm")
    })

    it("should render secondary variant", () => {
      render(<Button variant="secondary">Secondary</Button>)

      const button = screen.getByRole("button", { name: "Secondary" })
      expect(button).toHaveClass("bg-secondary", "text-secondary-foreground", "shadow-sm")
    })

    it("should render ghost variant", () => {
      render(<Button variant="ghost">Ghost</Button>)

      const button = screen.getByRole("button", { name: "Ghost" })
      expect(button).toHaveClass("hover:bg-accent", "hover:text-accent-foreground")
    })

    it("should render link variant", () => {
      render(<Button variant="link">Link</Button>)

      const button = screen.getByRole("button", { name: "Link" })
      expect(button).toHaveClass("text-primary", "underline-offset-4", "hover:underline")
    })
  })

  describe("sizes", () => {
    it("should render default size", () => {
      render(<Button size="default">Default</Button>)

      const button = screen.getByRole("button", { name: "Default" })
      expect(button).toHaveClass("h-9", "px-4", "py-2")
    })

    it("should render small size", () => {
      render(<Button size="sm">Small</Button>)

      const button = screen.getByRole("button", { name: "Small" })
      expect(button).toHaveClass("h-8", "rounded-md", "px-3", "text-xs")
    })

    it("should render large size", () => {
      render(<Button size="lg">Large</Button>)

      const button = screen.getByRole("button", { name: "Large" })
      expect(button).toHaveClass("h-10", "rounded-md", "px-8")
    })

    it("should render icon size", () => {
      render(<Button size="icon">Icon</Button>)

      const button = screen.getByRole("button", { name: "Icon" })
      expect(button).toHaveClass("h-9", "w-9")
    })
  })

  describe("interactions", () => {
    it("should handle click events", () => {
      const handleClick = vi.fn()
      render(<Button onClick={handleClick}>Click me</Button>)

      const button = screen.getByRole("button", { name: "Click me" })
      fireEvent.click(button)

      expect(handleClick).toHaveBeenCalledTimes(1)
    })

    it("should be disabled when disabled prop is true", () => {
      render(<Button disabled>Disabled</Button>)

      const button = screen.getByRole("button", { name: "Disabled" })
      expect(button).toBeDisabled()
      expect(button).toHaveClass("disabled:pointer-events-none", "disabled:opacity-50")
    })

    it("should not trigger click when disabled", () => {
      const handleClick = vi.fn()
      render(
        <Button disabled onClick={handleClick}>
          Disabled
        </Button>
      )

      const button = screen.getByRole("button", { name: "Disabled" })
      fireEvent.click(button)

      expect(handleClick).not.toHaveBeenCalled()
    })
  })

  describe("accessibility", () => {
    it("should have proper focus styles", () => {
      render(<Button>Focusable</Button>)

      const button = screen.getByRole("button", { name: "Focusable" })
      expect(button).toHaveClass(
        "focus-visible:outline-none",
        "focus-visible:ring-1",
        "focus-visible:ring-ring"
      )
    })

    it("should be keyboard accessible", () => {
      render(<Button>Keyboard accessible</Button>)

      const button = screen.getByRole("button", { name: "Keyboard accessible" })
      expect(button).not.toHaveAttribute("tabindex", "-1")
    })

    it("should support custom aria attributes", () => {
      render(
        <Button aria-label="Custom label" aria-describedby="description">
          Button
        </Button>
      )

      const button = screen.getByRole("button", { name: "Custom label" })
      expect(button).toHaveAttribute("aria-describedby", "description")
    })
  })

  describe("content", () => {
    it("should render text content", () => {
      render(<Button>Text content</Button>)

      expect(screen.getByText("Text content")).toBeInTheDocument()
    })

    it("should render JSX content", () => {
      render(
        <Button>
          <span>Icon</span> Text
        </Button>
      )

      expect(screen.getByText("Icon")).toBeInTheDocument()
      expect(screen.getByText("Text")).toBeInTheDocument()
    })

    it("should render SVG icons", () => {
      render(
        <Button>
          <svg data-testid="icon" />
          Button with icon
        </Button>
      )

      expect(screen.getByTestId("icon")).toBeInTheDocument()
      expect(screen.getByText("Button with icon")).toBeInTheDocument()
    })
  })

  describe("buttonVariants function", () => {
    it("should generate correct classes for default variant", () => {
      const classes = buttonVariants({ variant: "default", size: "default" })
      expect(classes).toContain("bg-primary")
      expect(classes).toContain("text-primary-foreground")
      expect(classes).toContain("h-9")
      expect(classes).toContain("px-4")
    })

    it("should generate correct classes for destructive variant", () => {
      const classes = buttonVariants({ variant: "destructive", size: "sm" })
      expect(classes).toContain("bg-destructive")
      expect(classes).toContain("text-destructive-foreground")
      expect(classes).toContain("h-8")
      expect(classes).toContain("text-xs")
    })

    it("should handle custom className", () => {
      const classes = buttonVariants({ variant: "default", size: "default", className: "custom" })
      expect(classes).toContain("custom")
    })
  })

  describe("edge cases", () => {
    it("should handle empty content", () => {
      render(<Button></Button>)

      const button = screen.getByRole("button")
      expect(button).toBeInTheDocument()
    })

    it("should handle null content", () => {
      render(<Button>{null}</Button>)

      const button = screen.getByRole("button")
      expect(button).toBeInTheDocument()
    })

    it("should handle undefined content", () => {
      render(<Button>{undefined}</Button>)

      const button = screen.getByRole("button")
      expect(button).toBeInTheDocument()
    })

    it("should handle multiple children", () => {
      render(
        <Button>
          <span>First</span>
          <span>Second</span>
        </Button>
      )

      expect(screen.getByText("First")).toBeInTheDocument()
      expect(screen.getByText("Second")).toBeInTheDocument()
    })
  })

  describe("asChild behavior", () => {
    it("should render as different element when asChild is true", () => {
      render(
        <Button asChild>
          <div data-testid="custom-element">Custom element</div>
        </Button>
      )

      const customElement = screen.getByTestId("custom-element")
      expect(customElement).toBeInTheDocument()
      expect(customElement).toHaveClass("inline-flex", "items-center", "justify-center")
    })

    it("should pass props to child element", () => {
      const handleClick = vi.fn()
      render(
        <Button asChild onClick={handleClick}>
          <div data-testid="custom-element">Custom element</div>
        </Button>
      )

      const customElement = screen.getByTestId("custom-element")
      fireEvent.click(customElement)

      expect(handleClick).toHaveBeenCalledTimes(1)
    })
  })

  describe("responsive design", () => {
    it("should handle different screen sizes", () => {
      render(<Button>Responsive button</Button>)

      const button = screen.getByRole("button", { name: "Responsive button" })
      expect(button).toBeInTheDocument()
    })
  })
})
