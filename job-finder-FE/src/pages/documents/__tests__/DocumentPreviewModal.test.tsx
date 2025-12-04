/**
 * Document Preview Modal Tests
 *
 * Tests for the PDF preview modal including:
 * - Rendering and display
 * - Loading state
 * - Download functionality
 * - Open in new tab functionality
 * - Close behavior
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { DocumentPreviewModal } from "../components/DocumentPreviewModal"

// Mock window.open
const mockWindowOpen = vi.fn()
Object.defineProperty(window, "open", {
  value: mockWindowOpen,
  writable: true,
})

describe("DocumentPreviewModal", () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    url: "http://localhost:3001/api/generator/artifacts/2024-01-15/test_resume_abc123.pdf",
    title: "Resume - Senior Engineer at Tech Corp",
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("Rendering", () => {
    it("should render dialog when open is true", () => {
      render(<DocumentPreviewModal {...defaultProps} />)

      expect(screen.getByRole("dialog")).toBeInTheDocument()
    })

    it("should not render dialog when open is false", () => {
      render(<DocumentPreviewModal {...defaultProps} open={false} />)

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })

    it("should display the title", () => {
      render(<DocumentPreviewModal {...defaultProps} />)

      expect(screen.getByText("Resume - Senior Engineer at Tech Corp")).toBeInTheDocument()
    })

    it("should render Download button", () => {
      render(<DocumentPreviewModal {...defaultProps} />)

      expect(screen.getByRole("button", { name: /download/i })).toBeInTheDocument()
    })

    it("should render Open button", () => {
      render(<DocumentPreviewModal {...defaultProps} />)

      expect(screen.getByRole("button", { name: /open/i })).toBeInTheDocument()
    })

    it("should render iframe with correct src", () => {
      render(<DocumentPreviewModal {...defaultProps} />)

      const iframe = document.querySelector("iframe")
      expect(iframe).toBeInTheDocument()
      expect(iframe?.src).toBe(defaultProps.url)
    })
  })

  describe("Loading State", () => {
    it("should show loading indicator initially", () => {
      render(<DocumentPreviewModal {...defaultProps} />)

      // The loading indicator should be visible before iframe loads
      // Uses Loader2 with animate-spin class
      const loadingContainer = document.querySelector(".animate-spin")
      expect(loadingContainer).toBeInTheDocument()
    })
  })

  describe("Open in New Tab", () => {
    it("should open URL in new tab when Open button is clicked", async () => {
      const user = userEvent.setup()
      render(<DocumentPreviewModal {...defaultProps} />)

      const openButton = screen.getByRole("button", { name: /open/i })
      await user.click(openButton)

      expect(mockWindowOpen).toHaveBeenCalledWith(defaultProps.url, "_blank")
    })

    it("should not call window.open when url is null", async () => {
      const user = userEvent.setup()
      render(<DocumentPreviewModal {...defaultProps} url={null} />)

      const openButton = screen.getByRole("button", { name: /open/i })
      await user.click(openButton)

      expect(mockWindowOpen).not.toHaveBeenCalled()
    })
  })

  describe("Download", () => {
    it("should trigger download when Download button is clicked", async () => {
      const user = userEvent.setup()

      // Track link click without breaking DOM
      const clickSpy = vi.fn()
      const originalCreateElement = document.createElement.bind(document)
      vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
        const element = originalCreateElement(tagName)
        if (tagName === "a") {
          element.click = clickSpy
        }
        return element
      })

      render(<DocumentPreviewModal {...defaultProps} />)

      const downloadButton = screen.getByRole("button", { name: /download/i })
      await user.click(downloadButton)

      expect(clickSpy).toHaveBeenCalled()

      vi.restoreAllMocks()
    })
  })

  describe("Close Behavior", () => {
    it("should call onOpenChange when dialog is closed via escape key", async () => {
      const onOpenChange = vi.fn()
      const user = userEvent.setup()

      render(<DocumentPreviewModal {...defaultProps} onOpenChange={onOpenChange} />)

      // Press escape to close
      await user.keyboard("{Escape}")

      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
  })

  describe("Null URL handling", () => {
    it("should handle null url prop gracefully", () => {
      // Should not throw when url is null
      expect(() => {
        render(<DocumentPreviewModal {...defaultProps} url={null} />)
      }).not.toThrow()
    })
  })

  describe("URL Format Validation", () => {
    /**
     * Verify the modal correctly handles URLs in the 2-segment format
     * created by the backend storage service.
     */
    it("should accept 2-segment artifact URLs", () => {
      const artifactUrl = "http://localhost:3001/api/generator/artifacts/2024-01-15/john-doe_tech-corp_senior-engineer_resume_abc123def456.pdf"

      // Should not throw when rendering with valid artifact URL
      expect(() => {
        render(
          <DocumentPreviewModal
            {...defaultProps}
            url={artifactUrl}
            title="Resume - Senior Engineer at Tech Corp"
          />
        )
      }).not.toThrow()
    })

    it("should accept relative URLs", () => {
      const relativeUrl = "/api/generator/artifacts/2024-01-15/test_resume.pdf"

      // Should not throw when rendering with relative URL
      expect(() => {
        render(<DocumentPreviewModal {...defaultProps} url={relativeUrl} />)
      }).not.toThrow()
    })
  })
})
