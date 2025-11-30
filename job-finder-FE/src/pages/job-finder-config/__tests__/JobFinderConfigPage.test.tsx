import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { BrowserRouter } from "react-router-dom"
import { JobFinderConfigPage } from "../JobFinderConfigPage"
import { configClient } from "@/api/config-client"

vi.mock("@/api/config-client", () => ({
  configClient: {
    listEntries: vi.fn(),
    getPrefilterPolicy: vi.fn(),
    getMatchPolicy: vi.fn(),
    getQueueSettings: vi.fn(),
    getAISettings: vi.fn(),
    getSchedulerSettings: vi.fn(),
    getPersonalInfo: vi.fn(),
    updatePrefilterPolicy: vi.fn(),
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

const basePrefilter = {
  stopList: { excludedCompanies: ["BadCo"], excludedKeywords: ["clearance"], excludedDomains: [] },
  strikeEngine: { enabled: true, strikeThreshold: 5, hardRejections: {}, remotePolicy: {}, salaryStrike: {}, experienceStrike: {}, seniorityStrikes: {}, qualityStrikes: {}, ageStrike: {} },
  technologyRanks: { technologies: {}, strikes: {} },
}

const baseMatch = {
  jobMatch: { minMatchScore: 70, portlandOfficeBonus: 15, userTimezone: -8, preferLargeCompanies: true, generateIntakeData: true },
  companyWeights: {},
  dealbreakers: { maxTimezoneDiffHours: 8, blockedLocations: [], requireRemote: false, allowHybridInTimezone: true },
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(configClient.listEntries).mockResolvedValue([
    { id: "prefilter-policy", payload: basePrefilter, updatedAt: "", updatedBy: "" },
    { id: "match-policy", payload: baseMatch, updatedAt: "", updatedBy: "" },
    { id: "queue-settings", payload: { processingTimeoutSeconds: 1800 }, updatedAt: "", updatedBy: "" },
    { id: "ai-settings", payload: { worker: { selected: { provider: "codex", interface: "cli", model: "gpt-4o" } }, documentGenerator: { selected: { provider: "codex", interface: "cli", model: "gpt-4o" } }, options: [] }, updatedAt: "", updatedBy: "" },
    { id: "scheduler-settings", payload: { pollIntervalSeconds: 60 }, updatedAt: "", updatedBy: "" },
    { id: "personal-info", payload: { name: "Test", email: "test@example.com", accentColor: "#3b82f6" }, updatedAt: "", updatedBy: "" },
  ])
  vi.mocked(configClient.getPrefilterPolicy).mockResolvedValue(basePrefilter)
  vi.mocked(configClient.getMatchPolicy).mockResolvedValue(baseMatch)
  vi.mocked(configClient.getQueueSettings).mockResolvedValue({ processingTimeoutSeconds: 1800 })
  vi.mocked(configClient.getAISettings).mockResolvedValue({ worker: { selected: { provider: "codex", interface: "cli", model: "gpt-4o" } }, documentGenerator: { selected: { provider: "codex", interface: "cli", model: "gpt-4o" } }, options: [] })
  vi.mocked(configClient.getSchedulerSettings).mockResolvedValue({ pollIntervalSeconds: 60 })
  vi.mocked(configClient.getPersonalInfo).mockResolvedValue({ name: "Test", email: "test@example.com", accentColor: "#3b82f6" })
  vi.mocked(configClient.updatePrefilterPolicy).mockResolvedValue(undefined)
  vi.mocked(configClient.updateMatchPolicy).mockResolvedValue(undefined)
})

describe("JobFinderConfigPage", () => {
  it("renders tabs for prefilter and match policies", async () => {
    renderWithRouter(<JobFinderConfigPage />)
    await waitFor(() => expect(screen.getByText("Job Finder Configuration")).toBeInTheDocument())
    expect(screen.getByRole("tab", { name: "Prefilter Policy" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Match Policy" })).toBeInTheDocument()
  })

  it("shows prefilter JSON with stopList", async () => {
    renderWithRouter(<JobFinderConfigPage />)
    const editors = await screen.findAllByRole("textbox")
    const hasStopList = editors.some((el) => (el as HTMLTextAreaElement).value.includes("stopList"))
    expect(hasStopList).toBe(true)
  })

  it("saves prefilter policy", async () => {
    const user = userEvent.setup()
    renderWithRouter(<JobFinderConfigPage />)
    const editor = await screen.findByRole("textbox")
    await user.type(editor, " ")
    await user.click(screen.getByRole("button", { name: /save policy/i }))
    await waitFor(() => expect(configClient.updatePrefilterPolicy).toHaveBeenCalled())
  })
})
