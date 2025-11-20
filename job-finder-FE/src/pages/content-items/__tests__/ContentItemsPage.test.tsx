import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ContentItemsPage } from "../ContentItemsPage"

vi.mock("@/hooks/useContentItems", () => ({
  useContentItems: () => ({
    contentItems: [],
    loading: false,
    error: null,
    createContentItem: vi.fn(),
    updateContentItem: vi.fn(),
    deleteContentItem: vi.fn(),
    reorderContentItem: vi.fn(),
    refetch: vi.fn()
  })
}))

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-1", email: "user@example.com" } })
}))

describe("ContentItemsPage", () => {
  it("renders empty state when no items", () => {
    render(<ContentItemsPage />)
    expect(screen.getByText(/No content items found/i)).toBeInTheDocument()
  })

  it("toggles root form visibility", () => {
    render(<ContentItemsPage />)
    const toggleButton = screen.getByRole("button", { name: /add root item/i })
    fireEvent.click(toggleButton)
    expect(screen.getByText(/new root item/i)).toBeInTheDocument()
  })
})
