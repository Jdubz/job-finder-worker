import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ContentItemsPage } from "../ContentItemsPage"

const createMock = vi.fn()
const refetchMock = vi.fn()
const mockAuth = { user: { id: "user-1", email: "user@example.com" }, isOwner: false }

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.isOwner = false
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
  useAuth: () => mockAuth
}))

describe("ContentItemsPage", () => {
  it("renders empty state and hides admin actions for non-admins", () => {
    render(<ContentItemsPage />)
    expect(screen.getByText(/No content items yet/i)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /export/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /add experience/i })).not.toBeInTheDocument()
  })

  it("shows edit controls only after admin enables edit mode", () => {
    mockAuth.isOwner = true
    render(<ContentItemsPage />)
    const editToggle = screen.getByRole("button", { name: /enter edit mode/i })
    fireEvent.click(editToggle)

    const addRoot = screen.getByRole("button", { name: /add experience/i })
    fireEvent.click(addRoot)
    expect(screen.getByText(/Add Experience Entry/i)).toBeInTheDocument()

    fireEvent.click(addRoot)
    expect(screen.queryByText(/Add Experience Entry/i)).not.toBeInTheDocument()
  })
})
