/**
 * Input Component Tests
 *
 * Comprehensive tests for the Input component functionality
 */

import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Input } from "../input"

describe("Input", () => {
  describe("rendering", () => {
    it("should render input with default props", () => {
      render(<Input placeholder="Enter text" />)

      const input = screen.getByRole("textbox")
      expect(input).toBeInTheDocument()
      expect(input).toHaveAttribute("placeholder", "Enter text")
    })

    it("should render input with custom className", () => {
      render(<Input className="custom-class" placeholder="Test" />)

      const input = screen.getByRole("textbox")
      expect(input).toHaveClass("custom-class")
    })

    it("should render input with different types", () => {
      const { rerender } = render(<Input type="text" placeholder="Text input" />)
      expect(screen.getByRole("textbox")).toHaveAttribute("type", "text")

      rerender(<Input type="email" placeholder="Email input" />)
      expect(screen.getByRole("textbox")).toHaveAttribute("type", "email")

      rerender(<Input type="password" placeholder="Password input" />)
      expect(screen.getByDisplayValue("")).toHaveAttribute("type", "password")
    })

    it("should render input with value", () => {
      render(<Input value="test value" onChange={() => {}} />)

      const input = screen.getByRole("textbox")
      expect(input).toHaveValue("test value")
    })

    it("should render input with default value", () => {
      render(<Input defaultValue="default value" />)

      const input = screen.getByRole("textbox")
      expect(input).toHaveValue("default value")
    })

    it("should render disabled input", () => {
      render(<Input disabled placeholder="Disabled input" />)

      const input = screen.getByRole("textbox")
      expect(input).toBeDisabled()
    })

    it("should render input with required attribute", () => {
      render(<Input required placeholder="Required input" />)

      const input = screen.getByRole("textbox")
      expect(input).toBeRequired()
    })
  })

  describe("interactions", () => {
    it("should handle onChange events", async () => {
      const user = userEvent.setup()
      const handleChange = vi.fn()

      render(<Input onChange={handleChange} placeholder="Test input" />)

      const input = screen.getByRole("textbox")
      await user.type(input, "test")

      expect(handleChange).toHaveBeenCalledTimes(4) // One for each character
    })

    it("should handle onFocus events", async () => {
      const user = userEvent.setup()
      const handleFocus = vi.fn()

      render(<Input onFocus={handleFocus} placeholder="Test input" />)

      const input = screen.getByRole("textbox")
      await user.click(input)

      expect(handleFocus).toHaveBeenCalledTimes(1)
    })

    it("should handle onBlur events", async () => {
      const user = userEvent.setup()
      const handleBlur = vi.fn()

      render(<Input onBlur={handleBlur} placeholder="Test input" />)

      const input = screen.getByRole("textbox")
      await user.click(input)
      await user.tab()

      expect(handleBlur).toHaveBeenCalledTimes(1)
    })

    it("should not trigger events when disabled", async () => {
      const user = userEvent.setup()
      const handleChange = vi.fn()
      const handleFocus = vi.fn()

      render(
        <Input
          disabled
          onChange={handleChange}
          onFocus={handleFocus}
          placeholder="Disabled input"
        />
      )

      const input = screen.getByRole("textbox")
      await user.click(input)
      await user.type(input, "test")

      expect(handleChange).not.toHaveBeenCalled()
      expect(handleFocus).not.toHaveBeenCalled()
    })
  })

  describe("accessibility", () => {
    it("should have proper ARIA attributes", () => {
      render(
        <Input aria-label="Test input" aria-describedby="description" placeholder="Test input" />
      )

      const input = screen.getByRole("textbox")
      expect(input).toHaveAttribute("aria-label", "Test input")
      expect(input).toHaveAttribute("aria-describedby", "description")
    })

    it("should be keyboard accessible", async () => {
      const user = userEvent.setup()
      render(<Input placeholder="Test input" />)

      const input = screen.getByRole("textbox")
      await user.tab()

      expect(input).toHaveFocus()
    })
  })

  describe("styling", () => {
    it("should have correct base classes", () => {
      render(<Input placeholder="Test input" />)

      const input = screen.getByRole("textbox")
      expect(input).toHaveClass(
        "flex",
        "h-9",
        "w-full",
        "rounded-md",
        "border",
        "border-input",
        "bg-transparent",
        "px-3",
        "py-1"
      )
    })

    it("should apply custom className alongside base classes", () => {
      render(<Input className="custom-class" placeholder="Test input" />)

      const input = screen.getByRole("textbox")
      expect(input).toHaveClass("custom-class")
      expect(input).toHaveClass("flex", "h-9", "w-full") // Base classes should still be present
    })
  })

  describe("ref forwarding", () => {
    it("should forward ref correctly", () => {
      const ref = vi.fn()

      render(<Input ref={ref} placeholder="Test input" />)

      expect(ref).toHaveBeenCalledWith(expect.any(HTMLInputElement))
    })
  })
})
