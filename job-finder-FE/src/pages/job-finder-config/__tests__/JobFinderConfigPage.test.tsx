import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { BrowserRouter } from "react-router-dom"
import { JobFinderConfigPage } from "../JobFinderConfigPage"
import { configClient } from "@/api/config-client"
import { DEFAULT_MATCH_POLICY, DEFAULT_PREFILTER_POLICY } from "@shared/types"

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

const basePrefilter = DEFAULT_PREFILTER_POLICY
const baseMatch = DEFAULT_MATCH_POLICY

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

  it("renders managed prefilter fields", async () => {
    renderWithRouter(<JobFinderConfigPage />)
    expect(await screen.findByLabelText(/^strike threshold$/i)).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /stop list/i })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /technology ranks/i })).toBeInTheDocument()
  })

  it("saves prefilter policy with validated fields", async () => {
    const user = userEvent.setup()
    renderWithRouter(<JobFinderConfigPage />)
    const strikeThreshold = await screen.findByLabelText(/^strike threshold$/i)
    fireEvent.change(strikeThreshold, { target: { value: "9" } })
    await user.click(screen.getByRole("button", { name: /save changes/i }))
    await waitFor(() => expect(configClient.updatePrefilterPolicy).toHaveBeenCalled())
    const payload = vi.mocked(configClient.updatePrefilterPolicy).mock.calls[0]?.[0]
    expect(payload?.strikeEngine?.strikeThreshold).toBe(9)
  })
})
