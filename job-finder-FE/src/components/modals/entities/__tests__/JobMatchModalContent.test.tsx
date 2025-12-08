import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { vi } from "vitest"
import { JobMatchModalContent } from "../JobMatchModalContent"
import type { JobMatchWithListing } from "@shared/types"
import * as generatorClientModule from "@/api/generator-client"
import * as jobMatchesClientModule from "@/api/job-matches-client"
import { toast } from "@/components/toast"

vi.mock("@/contexts/EntityModalContext", () => ({
  useEntityModal: () => ({ openModal: vi.fn() }),
}))

vi.mock("@/components/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const baseMatch: JobMatchWithListing = {
  id: "match-1",
  jobListingId: "listing-1",
  matchScore: 88,
  matchedSkills: ["react"],
  missingSkills: [],
  matchReasons: [],
  keyStrengths: [],
  potentialConcerns: [],
  experienceMatch: 90,
  customizationRecommendations: [],
  analyzedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  submittedBy: null,
  queueItemId: "q1",
  status: "active",
    listing: {
      id: "listing-1",
      url: "https://example.com",
      title: "Frontend Engineer",
      companyName: "ACME",
      location: "Remote",
      description: "Build stuff",
      status: "matched",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
}

describe("JobMatchModalContent", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("loads documents for a match and displays them", async () => {
    vi.spyOn(generatorClientModule.generatorClient, "listDocumentsForMatch").mockResolvedValue([
      {
        id: "req-1",
        generateType: "resume",
        job: { role: "Frontend Engineer", company: "ACME" },
        preferences: null,
        personalInfo: null,
        status: "completed",
        resumeUrl: "/files/resume.pdf",
        coverLetterUrl: null,
        jobMatchId: "match-1",
        createdBy: null,
        steps: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        artifacts: [],
      },
    ])

    render(<JobMatchModalContent match={baseMatch} />)

    const user = userEvent.setup({ pointerEventsCheck: 0 })
    await user.click(screen.getByRole("tab", { name: /Documents/i }))

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: /Documents/i })).toHaveAttribute("data-state", "active")
    )

    await waitFor(() => expect(screen.getByText(/Documents for this match/i)).toBeInTheDocument())
    expect(screen.getByText(/Frontend Engineer @ ACME/)).toBeInTheDocument()
  })

  it("updates status via select and shows badge", async () => {
    vi.spyOn(generatorClientModule.generatorClient, "listDocumentsForMatch").mockResolvedValue([])
    vi.spyOn(jobMatchesClientModule.jobMatchesClient, "updateStatus").mockResolvedValue({
      ...baseMatch,
      status: "ignored",
    })

    render(<JobMatchModalContent match={baseMatch} />)

    const statusSelect = await screen.findByRole("combobox", { name: /Match status/i })
    fireEvent.click(statusSelect)
    fireEvent.click(screen.getByRole("option", { name: /Ignored/i }))

    await waitFor(() => expect(jobMatchesClientModule.jobMatchesClient.updateStatus).toHaveBeenCalled())
    await waitFor(() => expect(screen.getAllByText(/Ignored/i).length).toBeGreaterThan(0))
    expect(toast.success).toHaveBeenCalled()
  })

  it("runs generation flow and shows download buttons", async () => {
    vi.spyOn(generatorClientModule.generatorClient, "listDocumentsForMatch").mockResolvedValue([])
    vi.spyOn(generatorClientModule.generatorClient, "startGeneration").mockResolvedValue({
      success: true,
      data: {
        requestId: "req-123",
        status: "processing",
        nextStep: "generate-resume",
        steps: [
          { id: "collect-data", name: "Collect", description: "", status: "completed" },
          { id: "generate-resume", name: "Gen", description: "", status: "pending" },
          { id: "render-pdf", name: "Render", description: "", status: "pending" },
        ],
        stepCompleted: "collect-data",
        resumeUrl: null,
        coverLetterUrl: null,
      },
      requestId: "req-123",
    } as any)

    vi.spyOn(generatorClientModule.generatorClient, "executeStep").mockResolvedValue({
      success: true,
      data: {
        requestId: "req-123",
        stepCompleted: "generate-resume",
        nextStep: null,
        status: "completed",
        resumeUrl: "/files/new.pdf",
        steps: [
          { id: "collect-data", name: "Collect", description: "", status: "completed" },
          { id: "generate-resume", name: "Gen", description: "", status: "completed" },
          { id: "render-pdf", name: "Render", description: "", status: "completed" },
        ],
      },
      requestId: "req-123",
    } as any)

    render(<JobMatchModalContent match={baseMatch} />)

    const user = userEvent.setup({ pointerEventsCheck: 0 })

    await user.click(screen.getByRole("tab", { name: /Documents/i }))

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: /Documents/i })).toHaveAttribute("data-state", "active")
    )

    const generateBtn = await screen.findByRole("button", { name: /Generate now/i })
    await user.click(generateBtn)

    await waitFor(() => expect(generatorClientModule.generatorClient.startGeneration).toHaveBeenCalled())
    const requestArg = vi.mocked(generatorClientModule.generatorClient.startGeneration).mock.calls[0][0]
    expect(requestArg.job.location).toBe(baseMatch.listing.location)
    await waitFor(() => expect(screen.getByText(/Documents ready/i)).toBeInTheDocument())
    expect(screen.getAllByText(/Resume/).length).toBeGreaterThan(0)
  })
})
