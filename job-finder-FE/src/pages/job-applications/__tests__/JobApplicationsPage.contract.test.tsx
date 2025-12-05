import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { BrowserRouter } from "react-router-dom"
import { JobApplicationsPage } from "../JobApplicationsPage"
import { useAuth } from "@/contexts/AuthContext"
import { useEntityModal } from "@/contexts/EntityModalContext"
import { jobMatchesClient } from "@/api/job-matches-client"

vi.mock("@/api/job-matches-client", () => ({
  jobMatchesClient: {
    subscribeToMatches: vi.fn(),
    getStats: vi.fn(),
  },
}))

vi.mock("@/contexts/AuthContext")
vi.mock("@/contexts/EntityModalContext")
vi.mock("@/services/logging", () => ({ logger: { info: vi.fn(), debug: vi.fn(), error: vi.fn() } }))
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>()
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  }
})

describe("JobApplicationsPage contract", () => {
  const mockMatches = [
    {
      id: "m100",
      jobListingId: "l100",
      matchScore: 87,
      matchedSkills: ["TypeScript", "React"],
      missingSkills: [],
      matchReasons: [],
      keyStrengths: [],
      potentialConcerns: [],
      experienceMatch: 90,
      customizationRecommendations: [],
      analyzedAt: "2024-02-01T12:00:00.000Z",
      createdAt: "2024-02-01T12:00:00.000Z",
      updatedAt: "2024-02-02T12:00:00.000Z",
      submittedBy: null,
      queueItemId: "q100",
      listing: {
        id: "l100",
        url: "https://example.com/jobs/l100",
        title: "Fullstack Engineer",
        companyName: "Example Co",
        description: "Do things",
        status: "matched",
        createdAt: "2024-02-01T12:00:00.000Z",
        updatedAt: "2024-02-02T12:00:00.000Z",
      },
    },
  ]

  const mockStats = {
    total: 1,
    highScore: 1,
    mediumScore: 0,
    lowScore: 0,
    averageScore: 87,
  }

  beforeEach(() => {
    vi.mocked(jobMatchesClient.subscribeToMatches).mockImplementation((callback) => {
      callback(mockMatches)
      return () => {}
    })
    vi.mocked(jobMatchesClient.getStats).mockResolvedValue(mockStats)

    vi.mocked(useAuth).mockReturnValue({
      user: { uid: "user-100" } as any,
      loading: false,
      isOwner: true,
      signOut: vi.fn(),
      signInWithGoogle: vi.fn(),
    } as any)

    vi.mocked(useEntityModal).mockReturnValue({ openModal: vi.fn(), closeModal: vi.fn() } as any)
  })

  it("renders matches when API responses align with shared schemas (ISO timestamps)", async () => {
    render(
      <BrowserRouter>
        <JobApplicationsPage />
      </BrowserRouter>
    )

    await waitFor(() => expect(screen.getByText("Fullstack Engineer")).toBeInTheDocument())
    await waitFor(() => expect(screen.getByText("Example Co")).toBeInTheDocument())
  })
})
