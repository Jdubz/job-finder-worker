import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { BrowserRouter } from "react-router-dom"
import { JobApplicationsPage } from "../JobApplicationsPage"
import { useAuth } from "@/contexts/AuthContext"
import { jobMatchesClient } from "@/api/job-matches-client"
import { useEntityModal } from "@/contexts/EntityModalContext"

vi.mock("@/contexts/AuthContext")
vi.mock("@/api/job-matches-client")
vi.mock("@/contexts/EntityModalContext")
vi.mock("@/services/logging", () => ({ logger: { info: vi.fn(), debug: vi.fn(), error: vi.fn() } }))
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>()
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  }
})

describe("JobApplicationsPage sorting", () => {
  const mockUser = { uid: "user-1" }
  const matches = [
    {
      id: "m1",
      matchScore: 80,
      jobListingId: "l1",
      listing: {
        id: "l1",
        title: "Backend Engineer",
        companyName: "Beta Co",
        companyId: "c1",
        location: "Remote",
        description: "desc",
        url: "https://b.io",
        status: "matched",
        createdAt: new Date("2024-01-02"),
        updatedAt: new Date("2024-01-04"),
      },
      analyzedAt: new Date(),
      createdAt: new Date("2024-01-02"),
      updatedAt: new Date("2024-01-07"),
      matchedSkills: [],
      missingSkills: [],
      matchReasons: [],
      keyStrengths: [],
      potentialConcerns: [],
      customizationRecommendations: [],
      experienceMatch: 80,
      submittedBy: null,
      queueItemId: "q1",
    },
    {
      id: "m2",
      matchScore: 92,
      jobListingId: "l2",
      listing: {
        id: "l2",
        title: "Frontend Engineer",
        companyName: "Acme",
        companyId: "c2",
        location: "NYC",
        description: "desc",
        url: "https://a.io",
        status: "pending",
        createdAt: new Date("2024-01-01"),
        updatedAt: new Date("2024-01-05"),
      },
      analyzedAt: new Date(),
      createdAt: new Date("2024-01-01"),
      updatedAt: new Date("2024-01-08"),
      matchedSkills: [],
      missingSkills: [],
      matchReasons: [],
      keyStrengths: [],
      potentialConcerns: [],
      customizationRecommendations: [],
      experienceMatch: 90,
      submittedBy: null,
      queueItemId: "q2",
    },
  ] as any

  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(useAuth).mockReturnValue({
      user: mockUser as any,
      loading: false,
      isOwner: true,
      signOut: vi.fn(),
      signInWithGoogle: vi.fn(),
    } as any)

    vi.mocked(useEntityModal).mockReturnValue({ openModal: vi.fn(), closeModal: vi.fn() } as any)

    vi.mocked(jobMatchesClient.subscribeToMatches).mockImplementation((callback) => {
      callback(matches)
      return () => {}
    })
  })

  const renderPage = () =>
    render(
      <BrowserRouter>
        <JobApplicationsPage />
      </BrowserRouter>
    )

  it("shows updated sort default and orders rows by latest update", async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText("Updated")).toBeInTheDocument()
    })

    const rows = screen.getAllByRole("row")
    const firstDataRow = rows[1]
    expect(within(firstDataRow).getByText("Frontend Engineer")).toBeInTheDocument()
  })

  it("changes ordering when sort switched to company", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderPage()

    await waitFor(() => expect(screen.getByText("Updated")).toBeInTheDocument())

    const [sortFieldCombobox] = screen.getAllByRole("combobox")
    await user.click(sortFieldCombobox)
    await user.click(await screen.findByRole("option", { name: "Company" }))

    await waitFor(() => {
      const rows = screen.getAllByRole("row")
      const firstDataRow = rows[1]
      // Alphabetical company ordering should put Acme first
      expect(within(firstDataRow).getByText("Frontend Engineer")).toBeInTheDocument()
    })
  })
})
