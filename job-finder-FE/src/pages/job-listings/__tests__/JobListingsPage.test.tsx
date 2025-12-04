import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { JobListingsPage } from "../JobListingsPage"
import { useAuth } from "@/contexts/AuthContext"
import { useJobListings } from "@/hooks/useJobListings"
import { useQueueItems } from "@/hooks/useQueueItems"
import { EntityModalProvider } from "@/contexts/EntityModalContext"

vi.mock("@/contexts/AuthContext")
vi.mock("@/hooks/useJobListings")
vi.mock("@/hooks/useQueueItems")

describe("JobListingsPage sorting", () => {
  const mockUser = { uid: "user-1", email: "t@example.com" }
  const mockSetFilters = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(useAuth).mockReturnValue({
      user: mockUser as any,
      loading: false,
      isOwner: true,
      signOut: vi.fn(),
      signInWithGoogle: vi.fn(),
    } as any)

    vi.mocked(useJobListings).mockReturnValue({
      listings: [
        {
          id: "l1",
          title: "Backend Engineer",
          companyName: "Beta Co",
          status: "matched",
          description: "desc",
          url: "https://b.io",
          createdAt: new Date("2024-01-01"),
          updatedAt: new Date("2024-01-05"),
        },
        {
          id: "l2",
          title: "Frontend Engineer",
          companyName: "Acme",
          status: "pending",
          description: "desc",
          url: "https://a.io",
          createdAt: new Date("2024-01-02"),
          updatedAt: new Date("2024-01-10"),
        },
      ] as any,
      loading: false,
      error: null,
      count: 2,
      refetch: vi.fn(),
      deleteListing: vi.fn(),
      setFilters: mockSetFilters,
    } as any)

    vi.mocked(useQueueItems).mockReturnValue({
      submitJob: vi.fn(),
      queueItems: [],
      loading: false,
      error: null,
      updateQueueItem: vi.fn(),
      deleteQueueItem: vi.fn(),
      refetch: vi.fn(),
    } as any)
  })

  const renderPage = () =>
    render(
      <EntityModalProvider>
        <JobListingsPage />
      </EntityModalProvider>
    )

  it("renders sort controls with updated default", async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText("Updated (newest)")).toBeInTheDocument()
      expect(screen.getByText("Desc")).toBeInTheDocument()
    })
  })

  it("updates filters when sort field and order change", async () => {
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => expect(screen.getByText("Updated (newest)")).toBeInTheDocument())

    await user.click(screen.getByText("Updated (newest)"))
    await user.click(screen.getByText("Company"))

    await user.click(screen.getByText("Desc"))
    await user.click(screen.getByText("Asc"))

    expect(mockSetFilters).toHaveBeenLastCalledWith({
      search: undefined,
      status: undefined,
      limit: 100,
      sortBy: "company",
      sortOrder: "asc",
    })
  })
})

