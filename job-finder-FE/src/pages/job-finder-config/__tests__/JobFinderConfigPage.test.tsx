import { render, screen } from "@testing-library/react"
import { describe, it, vi } from "vitest"
import { MemoryRouter } from "react-router-dom"
import { JobFinderConfigPage } from "../JobFinderConfigPage"
import type { WorkerSettings } from "@shared/types"

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
    workerSettings,
    setRuntimeSettings: vi.fn(),
    handleSaveWorkerSettings: vi.fn(),
    hasWorkerChanges: false,
    resetWorker: vi.fn(),
  }),
}))

describe("JobFinderConfigPage", () => {
  it("renders system config tabs for owner (no per-user tabs)", () => {
    render(
      <MemoryRouter>
        <JobFinderConfigPage />
      </MemoryRouter>
    )

    expect(screen.getByText("Job Finder Configuration")).toBeInTheDocument()
    expect(screen.getByText("Worker Runtime")).toBeInTheDocument()
    expect(screen.getByText("LLM Status")).toBeInTheDocument()
    // Per-user tabs should NOT be present (moved to User Settings)
    expect(screen.queryByText("Pre-Filter")).not.toBeInTheDocument()
    expect(screen.queryByText("Scoring")).not.toBeInTheDocument()
    expect(screen.queryByText("Personal")).not.toBeInTheDocument()
  })
})
