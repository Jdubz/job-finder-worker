import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, vi } from "vitest"
import { MemoryRouter } from "react-router-dom"
import { JobFinderConfigPage } from "../JobFinderConfigPage"
import type { PreFilterPolicy, MatchPolicy, WorkerSettings } from "@shared/types"

const prefilterPolicy: PreFilterPolicy = {
  title: { requiredKeywords: ["engineer"], excludedKeywords: ["intern"] },
  freshness: { maxAgeDays: 90 },
  workArrangement: {
    allowRemote: true,
    allowHybrid: true,
    allowOnsite: true,
    willRelocate: false,
    userLocation: "Portland, OR",
  },
  employmentType: { allowFullTime: true, allowPartTime: true, allowContract: true },
  salary: { minimum: null },
}

const matchPolicy: MatchPolicy = {
  minScore: 50,
  seniority: {
    preferred: ["senior"],
    acceptable: ["mid"],
    rejected: ["junior"],
    preferredScore: 10,
    acceptableScore: 0,
    rejectedScore: -100,
  },
  location: {
    allowRemote: true,
    allowHybrid: true,
    allowOnsite: true,
    userTimezone: -8,
    maxTimezoneDiffHours: 4,
    perHourScore: -1,
    hybridSameCityScore: 0,
  },
  skillMatch: {
    baseMatchScore: 1,
    yearsMultiplier: 0.5,
    maxYearsBonus: 5,
    missingScore: -1,
    analogScore: 0,
    maxBonus: 25,
    maxPenalty: -15,
    analogGroups: [],
  },
  salary: { minimum: null, target: null, belowTargetScore: 0 },
  experience: { maxRequired: 20, overqualifiedScore: 0 },
  freshness: {
    freshDays: 30,
    freshScore: 0,
    staleDays: 60,
    staleScore: -5,
    veryStaleDays: 90,
    veryStaleScore: -10,
    repostScore: -2,
  },
  roleFit: {
    preferred: [],
    acceptable: [],
    penalized: [],
    rejected: [],
    preferredScore: 0,
    penalizedScore: -1,
  },
  company: {
    preferredCityScore: 0,
    preferredCity: undefined,
    remoteFirstScore: 0,
    aiMlFocusScore: 0,
    largeCompanyScore: 0,
    smallCompanyScore: 0,
    largeCompanyThreshold: 1000,
    smallCompanyThreshold: 50,
    startupScore: 0,
  },
}

describe("JobFinderConfigPage", () => {
  it("renders missing skill penalty field", async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <JobFinderConfigPage />
      </MemoryRouter>
    )

    // Switch to Scoring tab so the field is rendered
    await user.click(screen.getByRole("tab", { name: /scoring/i }))

    expect(screen.getByLabelText(/missing skill penalty/i)).toBeInTheDocument()
  })
})

const workerSettings: WorkerSettings = {
  scraping: { requestTimeoutSeconds: 30, maxHtmlSampleLength: 20000 },
  textLimits: {
    minCompanyPageLength: 10,
    minSparseCompanyInfoLength: 10,
    maxIntakeTextLength: 500,
    maxIntakeDescriptionLength: 2000,
    maxIntakeFieldLength: 400,
    maxDescriptionPreviewLength: 500,
    maxCompanyInfoTextLength: 1000,
  },
  runtime: {
    processingTimeoutSeconds: 1800,
    isProcessingEnabled: true,
    taskDelaySeconds: 1,
    pollIntervalSeconds: 60,
    scrapeConfig: {},
  },
}

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { email: "owner@test" }, isOwner: true }),
}))

vi.mock("../hooks/useConfigState", () => ({
  useConfigState: () => ({
    isLoading: false,
    isSaving: false,
    error: null,
    success: null,
    prefilterPolicy,
    originalPrefilterPolicy: prefilterPolicy,
    handleSavePrefilter: vi.fn(),
    resetPrefilter: vi.fn(),
    matchPolicy,
    originalMatchPolicy: matchPolicy,
    handleSaveMatchPolicy: vi.fn(),
    resetMatchPolicy: vi.fn(),
    aiSettings: {
      worker: { selected: { provider: "gemini", interface: "api", model: "gemini-2.0-flash" } },
      documentGenerator: { selected: { provider: "gemini", interface: "api", model: "gemini-2.0-flash" } },
      options: [],
    },
    setAISettings: vi.fn(),
    handleSaveAISettings: vi.fn(),
    hasAIChanges: false,
    resetAI: vi.fn(),
    workerSettings,
    setRuntimeSettings: vi.fn(),
    handleSaveWorkerSettings: vi.fn(),
    hasWorkerChanges: false,
    resetWorker: vi.fn(),
    personalInfo: { email: "owner@test" },
    updatePersonalInfoState: vi.fn(),
    handleSavePersonalInfo: vi.fn(),
    hasPersonalInfoChanges: false,
    resetPersonal: vi.fn(),
  }),
}))

describe("JobFinderConfigPage", () => {
  it("renders config tabs for owner", () => {
    render(
      <MemoryRouter>
        <JobFinderConfigPage />
      </MemoryRouter>
    )

    expect(screen.getByText("Job Finder Configuration")).toBeInTheDocument()
    expect(screen.getByText("Pre-Filter")).toBeInTheDocument()
    expect(screen.getByText("Scoring")).toBeInTheDocument()
    expect(screen.getByText("Worker Runtime")).toBeInTheDocument()
    expect(screen.getByText("AI")).toBeInTheDocument()
    expect(screen.getByText("Personal")).toBeInTheDocument()
  })
})
