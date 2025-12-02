import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { BrowserRouter } from "react-router-dom"
import { JobFinderConfigPage } from "../JobFinderConfigPage"
import { configClient } from "@/api/config-client"
import { DEFAULT_TITLE_FILTER } from "@shared/types"
import type { MatchPolicy } from "@shared/types"

vi.mock("@/api/config-client", () => ({
  configClient: {
    listEntries: vi.fn(),
    getTitleFilter: vi.fn(),
    getMatchPolicy: vi.fn(),
    getQueueSettings: vi.fn(),
    getAISettings: vi.fn(),
    getSchedulerSettings: vi.fn(),
    getPersonalInfo: vi.fn(),
    updateTitleFilter: vi.fn(),
    updateMatchPolicy: vi.fn(),
    updateQueueSettings: vi.fn(),
    updateAISettings: vi.fn(),
    updateSchedulerSettings: vi.fn(),
    updatePersonalInfo: vi.fn(),
  },
}))

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    isOwner: true,
    user: { id: "u1", email: "test@example.com" },
  }),
}))

const renderWithRouter = (ui: React.ReactElement) =>
  render(<BrowserRouter>{ui}</BrowserRouter>)

const baseTitleFilter = DEFAULT_TITLE_FILTER

// Complete MatchPolicy fixture (no defaults - all sections required)
const baseMatchPolicy: MatchPolicy = {
  minScore: 60,
  weights: { skillMatch: 40, experienceMatch: 30, seniorityMatch: 30 },
  seniority: {
    preferred: ["senior", "staff", "lead"],
    acceptable: ["mid"],
    rejected: ["junior", "intern"],
    preferredBonus: 15,
    acceptablePenalty: 0,
    rejectedPenalty: -100,
  },
  location: {
    allowRemote: true,
    allowHybrid: true,
    allowOnsite: false,
    userTimezone: -8,
    maxTimezoneDiffHours: 4,
    perHourPenalty: 3,
    hybridSameCityBonus: 10,
  },
  technology: {
    required: ["typescript", "react"],
    preferred: ["node", "python"],
    disliked: ["angular"],
    rejected: ["wordpress"],
    requiredBonus: 10,
    preferredBonus: 5,
    dislikedPenalty: -5,
  },
  salary: {
    minimum: 150000,
    target: 200000,
    belowTargetPenalty: 2,
  },
  experience: {
    userYears: 12,
    maxRequired: 15,
    overqualifiedPenalty: 5,
  },
  freshness: {
    freshBonusDays: 2,
    freshBonus: 10,
    staleThresholdDays: 3,
    stalePenalty: -10,
    veryStaleDays: 12,
    veryStalePenalty: -20,
    repostPenalty: -5,
  },
  roleFit: {
    preferred: ["backend", "ml-ai", "devops", "data", "security"],
    acceptable: ["fullstack"],
    penalized: ["frontend", "consulting"],
    rejected: ["clearance-required", "management"],
    preferredBonus: 5,
    penalizedPenalty: -5,
  },
  company: {
    preferredCityBonus: 20,
    preferredCity: "Portland",
    remoteFirstBonus: 15,
    aiMlFocusBonus: 10,
    largeCompanyBonus: 10,
    smallCompanyPenalty: -5,
    largeCompanyThreshold: 10000,
    smallCompanyThreshold: 100,
    startupBonus: 0,
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(configClient.listEntries).mockResolvedValue([
    { id: "title-filter", payload: baseTitleFilter, updatedAt: "", updatedBy: "" },
    { id: "match-policy", payload: baseMatchPolicy, updatedAt: "", updatedBy: "" },
    { id: "queue-settings", payload: { processingTimeoutSeconds: 1800 }, updatedAt: "", updatedBy: "" },
    { id: "ai-settings", payload: { worker: { selected: { provider: "codex", interface: "cli", model: "gpt-4o" } }, documentGenerator: { selected: { provider: "codex", interface: "cli", model: "gpt-4o" } }, options: [] }, updatedAt: "", updatedBy: "" },
    { id: "scheduler-settings", payload: { pollIntervalSeconds: 60 }, updatedAt: "", updatedBy: "" },
    { id: "personal-info", payload: { name: "Test", email: "test@example.com", accentColor: "#3b82f6" }, updatedAt: "", updatedBy: "" },
  ])
  vi.mocked(configClient.getTitleFilter).mockResolvedValue(baseTitleFilter)
  vi.mocked(configClient.getMatchPolicy).mockResolvedValue(baseMatchPolicy)
  vi.mocked(configClient.getQueueSettings).mockResolvedValue({ processingTimeoutSeconds: 1800 })
  vi.mocked(configClient.getAISettings).mockResolvedValue({ worker: { selected: { provider: "codex", interface: "cli", model: "gpt-4o" } }, documentGenerator: { selected: { provider: "codex", interface: "cli", model: "gpt-4o" } }, options: [] })
  vi.mocked(configClient.getSchedulerSettings).mockResolvedValue({ pollIntervalSeconds: 60 })
  vi.mocked(configClient.getPersonalInfo).mockResolvedValue({ name: "Test", email: "test@example.com", accentColor: "#3b82f6" })
  vi.mocked(configClient.updateTitleFilter).mockResolvedValue(undefined)
  vi.mocked(configClient.updateMatchPolicy).mockResolvedValue(undefined)
})

describe("JobFinderConfigPage", () => {
  it("renders tabs for title filter and scoring config", async () => {
    renderWithRouter(<JobFinderConfigPage />)
    await waitFor(() => expect(screen.getByText("Job Finder Configuration")).toBeInTheDocument())
    expect(screen.getByRole("tab", { name: "Title Filter" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Scoring" })).toBeInTheDocument()
  })

  it("renders title filter fields", async () => {
    renderWithRouter(<JobFinderConfigPage />)
    expect(await screen.findByRole("heading", { name: /required keywords/i })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /excluded keywords/i })).toBeInTheDocument()
  })

  it("saves title filter with validated fields", async () => {
    const user = userEvent.setup()
    renderWithRouter(<JobFinderConfigPage />)

    await screen.findByText(/Job Finder Configuration/)

    // Make a change to enable the save button - add a new keyword
    const addButton = screen.getAllByRole("button", { name: /add/i })[0]
    await user.click(addButton)

    // Click save changes
    await user.click(screen.getByRole("button", { name: /save changes/i }))
    await waitFor(() => expect(configClient.updateTitleFilter).toHaveBeenCalled())
  })

  it("saves match policy with validated fields", async () => {
    const user = userEvent.setup()
    renderWithRouter(<JobFinderConfigPage />)

    await screen.findByText(/Job Finder Configuration/)

    await user.click(screen.getByRole("tab", { name: /scoring/i }))

    // Wait for scoring tab content to load
    await waitFor(() => expect(screen.getByLabelText(/minimum score/i)).toBeInTheDocument())

    const minScore = screen.getByLabelText(/minimum score/i)
    fireEvent.change(minScore, { target: { value: "70" } })
    await user.click(screen.getByRole("button", { name: /save changes/i }))

    await waitFor(() => expect(configClient.updateMatchPolicy).toHaveBeenCalled())
    const payload = vi.mocked(configClient.updateMatchPolicy).mock.calls[0]?.[0]
    expect(payload?.minScore).toBe(70)
  })
})
