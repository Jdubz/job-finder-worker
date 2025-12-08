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
        {
          id: "l3",
          title: "Data Engineer",
          companyName: "Zenith Labs",
          status: "pending",
          description: "desc",
          url: "https://z.io",
          createdAt: new Date("2024-01-03"),
          updatedAt: new Date("2024-01-06"),
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
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderPage()

    await waitFor(() => expect(screen.getByText("Updated (newest)")).toBeInTheDocument())

    const [sortFieldCombobox, sortOrderCombobox] = screen.getAllByRole("combobox")
    await user.click(sortFieldCombobox)
    await user.click(await screen.findByRole("option", { name: "Company" }))

    await user.click(sortOrderCombobox)
    await user.click(await screen.findByRole("option", { name: "Asc" }))

    await waitFor(() =>
      expect(mockSetFilters).toHaveBeenLastCalledWith({
        search: undefined,
        status: undefined,
        limit: 100,
        sortBy: "company",
        sortOrder: "asc",
      })
    )
  })

  it("sorts listings by company name ascending when selected", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderPage()

    const [sortFieldCombobox, sortOrderCombobox] = screen.getAllByRole("combobox")
    await user.click(sortFieldCombobox)
    await user.click(await screen.findByRole("option", { name: "Company" }))

    await user.click(sortOrderCombobox)
    await user.click(await screen.findByRole("option", { name: "Asc" }))

    await waitFor(() => {
      const rows = screen.getAllByRole("row").slice(1) // skip header
      const firstRow = rows[0]
      const lastRow = rows[rows.length - 1]
      expect(firstRow).toHaveTextContent("Acme")
      expect(lastRow).toHaveTextContent("Zenith Labs")
    })
  })

  it("sorts listings by created date when selected", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderPage()

    const [sortFieldCombobox] = screen.getAllByRole("combobox")
    await user.click(sortFieldCombobox)
    await user.click(await screen.findByRole("option", { name: "Created (newest)" }))

    // Keep default desc
    await waitFor(() => {
      const rows = screen.getAllByRole("row").slice(1)
      expect(rows[0]).toHaveTextContent("Zenith Labs")
      expect(rows[rows.length - 1]).toHaveTextContent("Beta Co")
    })
  })
})
