import { describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { BrowserRouter } from "react-router-dom"
import { jobMatchWithListingSchema, jobMatchStatsSchema } from "@shared/types"
import { JobApplicationsPage } from "../JobApplicationsPage"
import { useAuth } from "@/contexts/AuthContext"
import { useEntityModal } from "@/contexts/EntityModalContext"

const { mockMatches, mockStats } = vi.hoisted(() => ({
  mockMatches: [
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
  ],
  mockStats: {
    total: 1,
    highScore: 1,
    mediumScore: 0,
    lowScore: 0,
    averageScore: 87,
  },
}))

vi.mock("@/api/job-matches-client", async () => {
  const actual = await vi.importActual<typeof import("@/api/job-matches-client")>("@/api/job-matches-client")
  return {
    ...actual,
    jobMatchesClient: {
      ...actual.jobMatchesClient,
      subscribeToMatches: (callback: (matches: any[]) => void) => {
        const parsed = jobMatchWithListingSchema.array().parse(mockMatches)
        callback(parsed)
        return () => {}
      },
      getStats: vi.fn().mockResolvedValue(jobMatchStatsSchema.parse(mockStats)),
    },
  }
})

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

  it("renders matches when API responses align with shared schemas (ISO timestamps)", async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { uid: "user-100" } as any,
      loading: false,
      isOwner: true,
      signOut: vi.fn(),
      signInWithGoogle: vi.fn(),
    } as any)

    vi.mocked(useEntityModal).mockReturnValue({ openModal: vi.fn(), closeModal: vi.fn() } as any)

    render(
      <BrowserRouter>
        <JobApplicationsPage />
      </BrowserRouter>
    )

    await waitFor(() => expect(screen.getByText("Fullstack Engineer")).toBeInTheDocument())
    await waitFor(() => expect(screen.getByText("Example Co")).toBeInTheDocument())
  })
})
