import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ContentItemsPage } from "../ContentItemsPage"

const createMock = vi.fn()
const refetchMock = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
})

vi.mock("@/hooks/useContentItems", () => ({
  useContentItems: () => ({
    contentItems: [],
    loading: false,
    error: null,
    createContentItem: createMock,
    updateContentItem: vi.fn(),
    deleteContentItem: vi.fn(),
    reorderContentItem: vi.fn(),
    refetch: refetchMock
  })
}))

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-1", email: "user@example.com" } })
}))

describe("ContentItemsPage", () => {
  it("renders empty state and disables export when no items", () => {
    render(<ContentItemsPage />)
    expect(screen.getByText(/No content items yet/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /export/i })).toBeDisabled()
  })

  it("toggles root form visibility", () => {
    render(<ContentItemsPage />)
    const toggleButton = screen.getByRole("button", { name: /add root item/i })
    fireEvent.click(toggleButton)
    expect(screen.getByText(/Create Root Item/i)).toBeInTheDocument()
    fireEvent.click(toggleButton)
    expect(screen.queryByText(/Create Root Item/i)).not.toBeInTheDocument()
  })
})
