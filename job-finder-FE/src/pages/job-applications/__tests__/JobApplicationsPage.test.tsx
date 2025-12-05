import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { vi } from "vitest"
import { JobApplicationsPage } from "../JobApplicationsPage"

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}))

const subscribeToMatches = vi.fn()
const getStats = vi.fn()

vi.mock("@/api", () => ({
  jobMatchesClient: {
    subscribeToMatches,
    getStats,
  },
}))

vi.mock("@/contexts/EntityModalContext", () => ({
  useEntityModal: () => ({ openModal: vi.fn() }),
}))

describe("JobApplicationsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    subscribeToMatches.mockImplementation((cb, _filters) => {
      cb([])
      return () => {}
    })
    getStats.mockResolvedValue({ total: 0, highScore: 0, mediumScore: 0, lowScore: 0, averageScore: 0 })
  })

  it("subscribes with active status by default and all when showing ignored", async () => {
    render(
      <MemoryRouter>
        <JobApplicationsPage />
      </MemoryRouter>
    )

    await waitFor(() => expect(subscribeToMatches).toHaveBeenCalled())
    expect(subscribeToMatches.mock.calls[0][1]).toMatchObject({ status: "active" })

    const toggle = await screen.findByRole("button", { name: /Hide ignored/i })
    fireEvent.click(toggle)

    await waitFor(() => expect(subscribeToMatches.mock.calls[1][1]).toMatchObject({ status: "all" }))
    expect(screen.getByRole("button", { name: /Showing all/i })).toBeInTheDocument()
  })
})

