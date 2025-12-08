import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { vi } from "vitest"
import { JobApplicationsPage } from "../JobApplicationsPage"
import type { JobMatchWithListing } from "@shared/types"

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}))

const mocks = vi.hoisted(() => ({
  subscribeToMatches: vi.fn(),
  getStats: vi.fn(),
}))

vi.mock("@/api", () => ({
  jobMatchesClient: {
    subscribeToMatches: mocks.subscribeToMatches,
    getStats: mocks.getStats,
  },
}))

vi.mock("@/contexts/EntityModalContext", () => ({
  useEntityModal: () => ({ openModal: vi.fn() }),
}))

describe("JobApplicationsPage", () => {
  const matches: JobMatchWithListing[] = [
    {
      id: "1",
      jobListingId: "l1",
      matchScore: 72,
      matchedSkills: [],
      missingSkills: [],
      matchReasons: [],
      keyStrengths: [],
      potentialConcerns: [],
      experienceMatch: 60,
      customizationRecommendations: [],
      analyzedAt: new Date("2024-01-01"),
      createdAt: new Date("2024-01-01"),
      updatedAt: new Date("2024-01-02"),
      submittedBy: null,
      queueItemId: "q1",
      status: "active",
      listing: {
        id: "l1",
        url: "https://jobs/1",
        title: "A Engineer",
        companyName: "Alpha",
        location: "NY",
        description: "desc",
        status: "matched",
        createdAt: new Date("2024-01-01"),
        updatedAt: new Date("2024-01-02"),
      },
    },
    {
      id: "2",
      jobListingId: "l2",
      matchScore: 88,
      matchedSkills: [],
      missingSkills: [],
      matchReasons: [],
      keyStrengths: [],
      potentialConcerns: [],
      experienceMatch: 70,
      customizationRecommendations: [],
      analyzedAt: new Date("2024-01-03"),
      createdAt: new Date("2024-01-03"),
      updatedAt: new Date("2024-01-03"),
      submittedBy: null,
      queueItemId: "q2",
      status: "active",
      listing: {
        id: "l2",
        url: "https://jobs/2",
        title: "B Engineer",
        companyName: "Beta",
        location: "SF",
        description: "desc",
        status: "matched",
        createdAt: new Date("2024-01-03"),
        updatedAt: new Date("2024-01-03"),
      },
    },
    {
      id: "3",
      jobListingId: "l3",
      matchScore: 55,
      matchedSkills: [],
      missingSkills: [],
      matchReasons: [],
      keyStrengths: [],
      potentialConcerns: [],
      experienceMatch: 50,
      customizationRecommendations: [],
      analyzedAt: new Date("2024-01-04"),
      createdAt: new Date("2024-01-04"),
      updatedAt: new Date("2024-01-04"),
      submittedBy: null,
      queueItemId: "q3",
      status: "applied",
      listing: {
        id: "l3",
        url: "https://jobs/3",
        title: "C Engineer",
        companyName: "Gamma",
        location: "LA",
        description: "desc",
        status: "matched",
        createdAt: new Date("2024-01-04"),
        updatedAt: new Date("2024-01-04"),
      },
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.subscribeToMatches.mockImplementation((cb) => {
      cb(matches)
      return () => {}
    })
    mocks.getStats.mockResolvedValue({ total: 0, highScore: 0, mediumScore: 0, lowScore: 0, averageScore: 0 })
  })

  it("subscribes with active status by default and all when filtering", async () => {
    render(
      <MemoryRouter>
        <JobApplicationsPage />
      </MemoryRouter>
    )

    await waitFor(() => expect(mocks.subscribeToMatches).toHaveBeenCalled())
    expect(mocks.subscribeToMatches.mock.calls[0][1]).toMatchObject({ status: "active" })

    const statusSelect = screen.getByRole("combobox", { name: /status filter/i })
    fireEvent.click(statusSelect)
    fireEvent.click(screen.getByRole("option", { name: /All/i }))

    await waitFor(() => {
      expect(mocks.subscribeToMatches.mock.calls.some(([, filters]) => filters?.status === "all")).toBe(true)
    })
  })

  it("sorts by score when selected", async () => {
    render(
      <MemoryRouter>
        <JobApplicationsPage />
      </MemoryRouter>
    )

    // Wait for table rows
    await screen.findByText("A Engineer")
    const sortSelect = screen.getByRole("combobox", { name: /sort by/i })
    fireEvent.click(sortSelect)
    fireEvent.click(screen.getByRole("option", { name: /Score/i }))

    const rows = screen.getAllByRole("row").slice(1) // skip header row
    expect(rows[0]).toHaveTextContent("B Engineer")
    expect(rows[1]).toHaveTextContent("A Engineer")
  })

  it("sorts by company when selected", async () => {
    render(
      <MemoryRouter>
        <JobApplicationsPage />
      </MemoryRouter>
    )

    await screen.findByText("A Engineer")
    const sortSelect = screen.getByRole("combobox", { name: /sort by/i })
    fireEvent.click(sortSelect)
    fireEvent.click(screen.getByRole("option", { name: /Company/i }))

    const rows = screen.getAllByRole("row").slice(1)
    expect(rows[0]).toHaveTextContent("Alpha")
    expect(rows[1]).toHaveTextContent("Beta")
  })

  it("applies status filter locally", async () => {
    render(
      <MemoryRouter>
        <JobApplicationsPage />
      </MemoryRouter>
    )

    await screen.findByText("A Engineer")

    const statusSelect = screen.getByRole("combobox", { name: /status filter/i })
    fireEvent.click(statusSelect)
    fireEvent.click(screen.getByRole("option", { name: /Applied/i }))

    await waitFor(() => {
      const lastCall = mocks.subscribeToMatches.mock.calls.at(-1)
      expect(lastCall?.[1]).toMatchObject({ status: "applied" })
    })

    const rows = screen.getAllByRole("row").slice(1)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveTextContent("C Engineer")
  })
})
