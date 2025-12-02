import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { BrowserRouter } from "react-router-dom"
import { JobFinderConfigPage } from "../JobFinderConfigPage"
import { configClient } from "@/api/config-client"
import { DEFAULT_TITLE_FILTER, DEFAULT_SCORING_CONFIG } from "@shared/types"

vi.mock("@/api/config-client", () => ({
  configClient: {
    listEntries: vi.fn(),
    getTitleFilter: vi.fn(),
    getScoringConfig: vi.fn(),
    getQueueSettings: vi.fn(),
    getAISettings: vi.fn(),
    getSchedulerSettings: vi.fn(),
    getPersonalInfo: vi.fn(),
    updateTitleFilter: vi.fn(),
    updateScoringConfig: vi.fn(),
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
const baseScoringConfig = DEFAULT_SCORING_CONFIG

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(configClient.listEntries).mockResolvedValue([
    { id: "title-filter", payload: baseTitleFilter, updatedAt: "", updatedBy: "" },
    { id: "scoring-config", payload: baseScoringConfig, updatedAt: "", updatedBy: "" },
    { id: "queue-settings", payload: { processingTimeoutSeconds: 1800 }, updatedAt: "", updatedBy: "" },
    { id: "ai-settings", payload: { worker: { selected: { provider: "codex", interface: "cli", model: "gpt-4o" } }, documentGenerator: { selected: { provider: "codex", interface: "cli", model: "gpt-4o" } }, options: [] }, updatedAt: "", updatedBy: "" },
    { id: "scheduler-settings", payload: { pollIntervalSeconds: 60 }, updatedAt: "", updatedBy: "" },
    { id: "personal-info", payload: { name: "Test", email: "test@example.com", accentColor: "#3b82f6" }, updatedAt: "", updatedBy: "" },
  ])
  vi.mocked(configClient.getTitleFilter).mockResolvedValue(baseTitleFilter)
  vi.mocked(configClient.getScoringConfig).mockResolvedValue(baseScoringConfig)
  vi.mocked(configClient.getQueueSettings).mockResolvedValue({ processingTimeoutSeconds: 1800 })
  vi.mocked(configClient.getAISettings).mockResolvedValue({ worker: { selected: { provider: "codex", interface: "cli", model: "gpt-4o" } }, documentGenerator: { selected: { provider: "codex", interface: "cli", model: "gpt-4o" } }, options: [] })
  vi.mocked(configClient.getSchedulerSettings).mockResolvedValue({ pollIntervalSeconds: 60 })
  vi.mocked(configClient.getPersonalInfo).mockResolvedValue({ name: "Test", email: "test@example.com", accentColor: "#3b82f6" })
  vi.mocked(configClient.updateTitleFilter).mockResolvedValue(undefined)
  vi.mocked(configClient.updateScoringConfig).mockResolvedValue(undefined)
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

  it("saves scoring config with validated fields", async () => {
    const user = userEvent.setup()
    renderWithRouter(<JobFinderConfigPage />)

    await screen.findByText(/Job Finder Configuration/)

    await user.click(screen.getByRole("tab", { name: /scoring/i }))

    // Wait for scoring tab content to load
    await waitFor(() => expect(screen.getByLabelText(/minimum score/i)).toBeInTheDocument())

    const minScore = screen.getByLabelText(/minimum score/i)
    fireEvent.change(minScore, { target: { value: "70" } })
    await user.click(screen.getByRole("button", { name: /save changes/i }))

    await waitFor(() => expect(configClient.updateScoringConfig).toHaveBeenCalled())
    const payload = vi.mocked(configClient.updateScoringConfig).mock.calls[0]?.[0]
    expect(payload?.minScore).toBe(70)
  })
})
