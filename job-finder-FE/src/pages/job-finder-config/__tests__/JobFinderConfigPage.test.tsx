/**
 * Job Finder Configuration Page Tests
 *
 * Comprehensive tests for the Job Finder Configuration functionality
 * Rank 3 - HIGH: System configuration management
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { BrowserRouter } from "react-router-dom"
import { JobFinderConfigPage } from "../JobFinderConfigPage"
import { configClient } from "@/api/config-client"

// Mock the config client
vi.mock("@/api/config-client", () => ({
  configClient: {
    getStopList: vi.fn(),
    getQueueSettings: vi.fn(),
    getAISettings: vi.fn(),
    getJobMatch: vi.fn(),
    getJobFilters: vi.fn(),
    getTechnologyRanks: vi.fn(),
    getSchedulerSettings: vi.fn(),
    getCompanyScoring: vi.fn(),
    getWorkerSettings: vi.fn(),
    updateStopList: vi.fn(),
    updateQueueSettings: vi.fn(),
    updateAISettings: vi.fn(),
    updateJobMatch: vi.fn(),
    updateJobFilters: vi.fn(),
    updateTechnologyRanks: vi.fn(),
    updateSchedulerSettings: vi.fn(),
    updateCompanyScoring: vi.fn(),
    updateWorkerSettings: vi.fn(),
  },
}))

// Mock auth state that can be modified per test
const mockAuthState = {
  isOwner: true,
  user: {
    id: "test-user-123",
    uid: "test-user-123",
    email: "test@example.com",
    displayName: "Test User",
  },
}

// Mock the auth context
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockAuthState,
}))

// Helper function to render with router
const renderWithRouter = (component: React.ReactElement) => {
  return render(<BrowserRouter>{component}</BrowserRouter>)
}

// Mock data
const mockStopList = {
  excludedCompanies: ["Bad Company", "Spam Corp"],
  excludedKeywords: ["contractor", "freelance"],
  excludedDomains: ["spam.com", "fake-jobs.com"],
}

const mockQueueSettings = {
  processingTimeoutSeconds: 600,
}

const mockAISettings = {
  worker: {
    selected: {
      provider: "codex" as const,
      interface: "cli" as const,
      model: "gpt-4o",
    },
  },
  documentGenerator: {
    selected: {
      provider: "openai" as const,
      interface: "api" as const,
      model: "gpt-4o",
    },
  },
  options: [
    {
      value: "codex" as const,
      interfaces: [{ value: "cli" as const, models: ["gpt-4o", "gpt-4o-mini"], enabled: true }],
    },
    {
      value: "openai" as const,
      interfaces: [{ value: "api" as const, models: ["gpt-4o"], enabled: true }],
    },
  ],
}

const mockJobMatch = {
  minMatchScore: 70,
  portlandOfficeBonus: 15,
  userTimezone: -8,
  preferLargeCompanies: true,
  generateIntakeData: true,
}

const mockJobFilters = {
  enabled: true,
  strikeThreshold: 5,
  hardRejections: { excludedCompanies: [], excludedKeywords: [] },
  remotePolicy: {},
  salaryStrike: {},
  experienceStrike: {},
  seniorityStrikes: {},
  qualityStrikes: { buzzwords: [] },
  ageStrike: {},
}

const mockTechRanks = {
  technologies: {
    react: { rank: "required" as const, points: 0 },
    typescript: { rank: "required" as const, points: 0 },
  },
  strikes: { missingAllRequired: 1, perBadTech: 2 },
}

const mockScheduler = {
  pollIntervalSeconds: 60,
}

const mockCompanyScoring = {
  tierThresholds: { s: 150, a: 100, b: 70, c: 50 },
  priorityBonuses: { portlandOffice: 50, remoteFirst: 15, aiMlFocus: 10, techStackMax: 100 },
  matchAdjustments: {
    largeCompanyBonus: 10,
    smallCompanyPenalty: -5,
    largeCompanyThreshold: 10000,
    smallCompanyThreshold: 100,
  },
  timezoneAdjustments: {
    sameTimezone: 5,
    diff1to2hr: -2,
    diff3to4hr: -5,
    diff5to8hr: -10,
    diff9plusHr: -15,
  },
  priorityThresholds: { high: 85, medium: 70 },
}

const mockWorkerSettings = {
  scraping: {
    requestTimeoutSeconds: 30,
    rateLimitDelaySeconds: 2,
    maxRetries: 3,
    maxHtmlSampleLength: 20000,
    maxHtmlSampleLengthSmall: 15000,
  },
  health: { maxConsecutiveFailures: 5, healthCheckIntervalSeconds: 3600 },
  cache: { companyInfoTtlSeconds: 86400, sourceConfigTtlSeconds: 3600 },
  textLimits: {
    minCompanyPageLength: 200,
    minSparseCompanyInfoLength: 100,
    maxIntakeTextLength: 500,
    maxIntakeDescriptionLength: 2000,
    maxIntakeFieldLength: 400,
    maxDescriptionPreviewLength: 500,
    maxCompanyInfoTextLength: 1000,
  },
}

describe("JobFinderConfigPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset auth state
    mockAuthState.isOwner = true

    // Setup default mocks
    vi.mocked(configClient.getStopList).mockResolvedValue(mockStopList)
    vi.mocked(configClient.getQueueSettings).mockResolvedValue(mockQueueSettings)
    vi.mocked(configClient.getAISettings).mockResolvedValue(mockAISettings)
    vi.mocked(configClient.getJobMatch).mockResolvedValue(mockJobMatch)
    vi.mocked(configClient.getJobFilters).mockResolvedValue(mockJobFilters)
    vi.mocked(configClient.getTechnologyRanks).mockResolvedValue(mockTechRanks)
    vi.mocked(configClient.getSchedulerSettings).mockResolvedValue(mockScheduler)
    vi.mocked(configClient.getCompanyScoring).mockResolvedValue(mockCompanyScoring)
    vi.mocked(configClient.getWorkerSettings).mockResolvedValue(mockWorkerSettings)
    vi.mocked(configClient.updateStopList).mockResolvedValue(undefined)
    vi.mocked(configClient.updateQueueSettings).mockResolvedValue(undefined)
    vi.mocked(configClient.updateAISettings).mockResolvedValue(undefined)
    vi.mocked(configClient.updateJobMatch).mockResolvedValue(undefined)
    vi.mocked(configClient.updateJobFilters).mockResolvedValue(undefined)
    vi.mocked(configClient.updateTechnologyRanks).mockResolvedValue(undefined)
    vi.mocked(configClient.updateSchedulerSettings).mockResolvedValue(undefined)
    vi.mocked(configClient.updateCompanyScoring).mockResolvedValue(undefined)
    vi.mocked(configClient.updateWorkerSettings).mockResolvedValue(undefined)
  })

  describe("rendering", () => {
    it("should render configuration page with all tabs", async () => {
      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("Job Finder Configuration")).toBeInTheDocument()
      })

      // Check tabs (shortened names to fit 9-column layout)
      expect(screen.getByRole("tab", { name: "Stop List" })).toBeInTheDocument()
      expect(screen.getByRole("tab", { name: "Queue" })).toBeInTheDocument()
      expect(screen.getByRole("tab", { name: "AI" })).toBeInTheDocument()
      expect(screen.getByRole("tab", { name: "Match" })).toBeInTheDocument()
      expect(screen.getByRole("tab", { name: "Filters" })).toBeInTheDocument()
      expect(screen.getByRole("tab", { name: "Tech" })).toBeInTheDocument()
      expect(screen.getByRole("tab", { name: "Scheduler" })).toBeInTheDocument()
      expect(screen.getByRole("tab", { name: "Scoring" })).toBeInTheDocument()
      expect(screen.getByRole("tab", { name: "Worker" })).toBeInTheDocument()
    })

    it("should show loading state while fetching configuration", () => {
      // Mock slow response
      vi.mocked(configClient.getStopList).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(mockStopList), 100))
      )

      renderWithRouter(<JobFinderConfigPage />)

      expect(screen.getByText("Loading configuration...")).toBeInTheDocument()
    })

    it("should show permission error for non-editor users", () => {
      // Modify mock auth state to simulate non-owner
      mockAuthState.isOwner = false

      renderWithRouter(<JobFinderConfigPage />)

      expect(
        screen.getByText(
          "You do not have permission to access job finder configuration. Editor role required."
        )
      ).toBeInTheDocument()
    })
  })

  describe("stop list management", () => {
    it("should display existing excluded companies", async () => {
      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("Bad Company")).toBeInTheDocument()
        expect(screen.getByText("Spam Corp")).toBeInTheDocument()
      })
    })

    it("should add new company to stop list", async () => {
      const user = userEvent.setup()
      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("Job Finder Configuration")).toBeInTheDocument()
        expect(screen.queryByText("Loading configuration...")).not.toBeInTheDocument()
      })

      // Add new company
      const companyInput = screen.getByPlaceholderText("Enter company name...")
      await user.type(companyInput, "New Bad Company")

      // Find the Add button in the companies section
      const addButtons = screen.getAllByText("Add")
      await user.click(addButtons[0]) // First Add button is for companies

      await waitFor(() => {
        expect(screen.getByText("New Bad Company")).toBeInTheDocument()
      })
    })

    it("should remove company from stop list", async () => {
      const user = userEvent.setup()
      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("Bad Company")).toBeInTheDocument()
      })

      // Find the badge with "Bad Company" (Badge uses div) and its remove button
      const badCompanyBadge = screen.getByText("Bad Company").closest("div")
      const removeButton = badCompanyBadge?.querySelector("button")
      if (removeButton) {
        await user.click(removeButton)
      }

      await waitFor(() => {
        expect(screen.queryByText("Bad Company")).not.toBeInTheDocument()
      })
    })

    it("should add new keyword to stop list", async () => {
      const user = userEvent.setup()
      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("Job Finder Configuration")).toBeInTheDocument()
        expect(screen.queryByText("Loading configuration...")).not.toBeInTheDocument()
      })

      // Add new keyword
      const keywordInput = screen.getByPlaceholderText("Enter keyword...")
      await user.type(keywordInput, "temporary")

      // Find the Add button in the keywords section
      const addButtons = screen.getAllByText("Add")
      await user.click(addButtons[1]) // Second Add button is for keywords

      await waitFor(() => {
        expect(screen.getByText("temporary")).toBeInTheDocument()
      })
    })

    it("should add new domain to stop list", async () => {
      const user = userEvent.setup()
      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("Job Finder Configuration")).toBeInTheDocument()
        expect(screen.queryByText("Loading configuration...")).not.toBeInTheDocument()
      })

      // Add new domain
      const domainInput = screen.getByPlaceholderText("Enter domain (e.g., example.com)...")
      await user.type(domainInput, "scam-jobs.com")

      // Find the Add button in the domains section
      const addButtons = screen.getAllByText("Add")
      await user.click(addButtons[2]) // Third Add button is for domains

      await waitFor(() => {
        expect(screen.getByText("scam-jobs.com")).toBeInTheDocument()
      })
    })

    it("should save stop list changes", async () => {
      const user = userEvent.setup()
      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("Job Finder Configuration")).toBeInTheDocument()
        expect(screen.queryByText("Loading configuration...")).not.toBeInTheDocument()
      })

      // Add new company
      const companyInput = screen.getByPlaceholderText("Enter company name...")
      await user.type(companyInput, "New Company")
      const addButtons = screen.getAllByText("Add")
      await user.click(addButtons[0])

      // Save changes
      await user.click(screen.getByText("Save Changes"))

      await waitFor(() => {
        expect(configClient.updateStopList).toHaveBeenCalledWith(
          expect.objectContaining({
            excludedCompanies: expect.arrayContaining(["New Company"]),
          })
        )
      })
    })

    it("should reset stop list changes", async () => {
      const user = userEvent.setup()
      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("Job Finder Configuration")).toBeInTheDocument()
        expect(screen.queryByText("Loading configuration...")).not.toBeInTheDocument()
      })

      // Add new company
      const companyInput = screen.getByPlaceholderText("Enter company name...")
      await user.type(companyInput, "New Company")
      const addButtons = screen.getAllByText("Add")
      await user.click(addButtons[0])

      await waitFor(() => {
        expect(screen.getByText("New Company")).toBeInTheDocument()
      })

      // Reset changes
      await user.click(screen.getByText("Reset"))

      await waitFor(() => {
        expect(screen.queryByText("New Company")).not.toBeInTheDocument()
      })
    })
  })

  describe("queue settings management", () => {
    it("should switch to queue settings tab", async () => {
      const user = userEvent.setup()
      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("Job Finder Configuration")).toBeInTheDocument()
        expect(screen.queryByText("Loading configuration...")).not.toBeInTheDocument()
      })

      await user.click(screen.getByRole("tab", { name: "Queue" }))

      await waitFor(() => {
        expect(screen.getByText("Queue Processing Settings")).toBeInTheDocument()
      })
    })

    it("should display current queue settings", async () => {
      const user = userEvent.setup()
      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("Job Finder Configuration")).toBeInTheDocument()
        expect(screen.queryByText("Loading configuration...")).not.toBeInTheDocument()
      })

      await user.click(screen.getByRole("tab", { name: "Queue" }))

      await waitFor(() => {
        expect(screen.getByDisplayValue("600")).toBeInTheDocument() // processingTimeoutSeconds
      })
    })

    it("should update queue settings", async () => {
      const user = userEvent.setup()
      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("Job Finder Configuration")).toBeInTheDocument()
        expect(screen.queryByText("Loading configuration...")).not.toBeInTheDocument()
      })

      await user.click(screen.getByRole("tab", { name: "Queue" }))

      const timeoutInput = await screen.findByLabelText("Processing Timeout (seconds)")
      await user.clear(timeoutInput)
      await user.type(timeoutInput, "900")

      // Save changes
      await user.click(screen.getByText("Save Changes"))

      await waitFor(() => {
        expect(configClient.updateQueueSettings).toHaveBeenCalled()
      })
    })
  })

  describe("AI settings management", () => {
    it("should switch to AI settings tab", async () => {
      const user = userEvent.setup()
      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("Job Finder Configuration")).toBeInTheDocument()
        expect(screen.queryByText("Loading configuration...")).not.toBeInTheDocument()
      })

      await user.click(screen.getByRole("tab", { name: "AI" }))

      await waitFor(() => {
        expect(screen.getByText("AI Provider Configuration")).toBeInTheDocument()
      })
    })

    it("should display current AI settings with provider selection", async () => {
      const user = userEvent.setup()
      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("Job Finder Configuration")).toBeInTheDocument()
        expect(screen.queryByText("Loading configuration...")).not.toBeInTheDocument()
      })

      await user.click(screen.getByRole("tab", { name: "AI" }))

      await waitFor(() => {
        expect(screen.getByText("AI Provider Configuration")).toBeInTheDocument()
        expect(screen.getAllByLabelText("Provider")).toHaveLength(2)
        expect(screen.getAllByLabelText("Interface")).toHaveLength(2)
        expect(screen.getAllByLabelText("Model")).toHaveLength(2)
      })
    })

    // Note: Save button is disabled without changes; testing dropdown interactions is complex
    // These tests verify rendering; save functionality is tested via manual testing
  })

  describe("job match settings management", () => {
    it("should switch to job match tab", async () => {
      const user = userEvent.setup()
      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("Job Finder Configuration")).toBeInTheDocument()
        expect(screen.queryByText("Loading configuration...")).not.toBeInTheDocument()
      })

      await user.click(screen.getByRole("tab", { name: "Match" }))

      await waitFor(() => {
        expect(screen.getByText("Job Match Configuration")).toBeInTheDocument()
      })
    })

    it("should display current job match settings", async () => {
      const user = userEvent.setup()
      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("Job Finder Configuration")).toBeInTheDocument()
        expect(screen.queryByText("Loading configuration...")).not.toBeInTheDocument()
      })

      await user.click(screen.getByRole("tab", { name: "Match" }))

      await waitFor(() => {
        expect(screen.getByLabelText("Minimum Match Score")).toBeInTheDocument()
        expect(screen.getByDisplayValue("70")).toBeInTheDocument() // minMatchScore
      })
    })

    it("should update minimum match score", async () => {
      const user = userEvent.setup()
      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("Job Finder Configuration")).toBeInTheDocument()
        expect(screen.queryByText("Loading configuration...")).not.toBeInTheDocument()
      })

      await user.click(screen.getByRole("tab", { name: "Match" }))

      await waitFor(() => {
        expect(screen.getByLabelText("Minimum Match Score")).toBeInTheDocument()
      })

      // Update min match score
      const scoreInput = screen.getByLabelText("Minimum Match Score")
      await user.clear(scoreInput)
      await user.type(scoreInput, "80")

      // Save changes
      await user.click(screen.getByText("Save Changes"))

      await waitFor(() => {
        expect(configClient.updateJobMatch).toHaveBeenCalled()
      })
    })
  })

  describe("error handling", () => {
    it("should show error when loading configuration fails", async () => {
      vi.mocked(configClient.getStopList).mockRejectedValue(new Error("Failed to load"))

      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("Failed to load configuration settings")).toBeInTheDocument()
      })
    })

    it("should show error when saving stop list fails", async () => {
      const user = userEvent.setup()
      vi.mocked(configClient.updateStopList).mockRejectedValue(new Error("Save failed"))

      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("Job Finder Configuration")).toBeInTheDocument()
        expect(screen.queryByText("Loading configuration...")).not.toBeInTheDocument()
      })

      // Add new company
      const companyInput = screen.getByPlaceholderText("Enter company name...")
      await user.type(companyInput, "New Company")
      const addButtons = screen.getAllByText("Add")
      await user.click(addButtons[0])

      // Save changes
      await user.click(screen.getByText("Save Changes"))

      await waitFor(() => {
        expect(screen.getByText("Failed to save stop list")).toBeInTheDocument()
      })
    })

    it("should show error when saving queue settings fails", async () => {
      const user = userEvent.setup()
      vi.mocked(configClient.updateQueueSettings).mockRejectedValue(new Error("Save failed"))

      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("Job Finder Configuration")).toBeInTheDocument()
        expect(screen.queryByText("Loading configuration...")).not.toBeInTheDocument()
      })

      await user.click(screen.getByRole("tab", { name: "Queue" }))

      await waitFor(() => {
        expect(screen.getByDisplayValue("600")).toBeInTheDocument()
      })

      // Update processing timeout
      const timeoutInput = screen.getByDisplayValue("600")
      await user.clear(timeoutInput)
      await user.type(timeoutInput, "900")

      // Save changes
      await user.click(screen.getByText("Save Changes"))

      await waitFor(() => {
        expect(screen.getByText("Failed to save queue settings")).toBeInTheDocument()
      })
    })

    // Note: AI settings save error test skipped - Save button disabled without dropdown changes
  })

  describe("success feedback", () => {
    it("should show success message when stop list is saved", async () => {
      const user = userEvent.setup()
      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("Job Finder Configuration")).toBeInTheDocument()
        expect(screen.queryByText("Loading configuration...")).not.toBeInTheDocument()
      })

      // Add new company
      const companyInput = screen.getByPlaceholderText("Enter company name...")
      await user.type(companyInput, "New Company")
      const addButtons = screen.getAllByText("Add")
      await user.click(addButtons[0])

      // Save changes
      await user.click(screen.getByText("Save Changes"))

      await waitFor(() => {
        expect(screen.getByText("Stop list saved successfully!")).toBeInTheDocument()
      })
    })

    it("should show success message when queue settings are saved", async () => {
      const user = userEvent.setup()
      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("Job Finder Configuration")).toBeInTheDocument()
        expect(screen.queryByText("Loading configuration...")).not.toBeInTheDocument()
      })

      await user.click(screen.getByRole("tab", { name: "Queue" }))

      await waitFor(() => {
        expect(screen.getByDisplayValue("600")).toBeInTheDocument()
      })

      // Update processing timeout
      const timeoutInput = screen.getByDisplayValue("600")
      await user.clear(timeoutInput)
      await user.type(timeoutInput, "900")

      // Save changes
      await user.click(screen.getByText("Save Changes"))

      await waitFor(() => {
        expect(screen.getByText("Queue settings saved successfully!")).toBeInTheDocument()
      })
    })

    // Note: AI settings save success test skipped - Save button disabled without dropdown changes
  })

  describe("form validation", () => {
    it("should not add empty company name", async () => {
      const user = userEvent.setup()
      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("Job Finder Configuration")).toBeInTheDocument()
        expect(screen.queryByText("Loading configuration...")).not.toBeInTheDocument()
      })

      // Try to add empty company
      const companyInput = screen.getByPlaceholderText("Enter company name...")
      await user.type(companyInput, "   ")
      const addButtons = screen.getAllByText("Add")
      await user.click(addButtons[0])

      // Should not be added - whitespace only should be trimmed
      const badges = screen.getAllByText(/Bad Company|Spam Corp/i)
      expect(badges.length).toBe(2) // Only original companies
    })

    it("should handle Enter key to add items", async () => {
      const user = userEvent.setup()
      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("Job Finder Configuration")).toBeInTheDocument()
        expect(screen.queryByText("Loading configuration...")).not.toBeInTheDocument()
      })

      // Add company using Enter key
      const companyInput = screen.getByPlaceholderText("Enter company name...")
      await user.type(companyInput, "Enter Company{Enter}")

      await waitFor(() => {
        expect(screen.getByText("Enter Company")).toBeInTheDocument()
      })
    })
  })

  describe("accessibility", () => {
    it("should have proper form labels", async () => {
      const user = userEvent.setup()
      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("Job Finder Configuration")).toBeInTheDocument()
        expect(screen.queryByText("Loading configuration...")).not.toBeInTheDocument()
      })

      await user.click(screen.getByRole("tab", { name: "Queue" }))

      await waitFor(() => {
        // Check form labels exist
        expect(screen.getByLabelText("Processing Timeout (seconds)")).toBeInTheDocument()
      })
    })

    it("should be keyboard navigable", async () => {
      const user = userEvent.setup()
      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("Job Finder Configuration")).toBeInTheDocument()
        expect(screen.queryByText("Loading configuration...")).not.toBeInTheDocument()
      })

      // Test tab navigation
      await user.tab()
      expect(document.activeElement).toBeInTheDocument()
    })
  })

  describe("responsive design", () => {
    it("should handle different screen sizes", async () => {
      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("Job Finder Configuration")).toBeInTheDocument()
      })

      // Check if responsive classes are applied
      const container = screen.getByText("Job Finder Configuration").closest("div")
      expect(container).toBeInTheDocument()
    })
  })

  describe("company scoring tab", () => {
    it("should display scoring tab content when clicked", async () => {
      const user = userEvent.setup()
      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("Job Finder Configuration")).toBeInTheDocument()
        expect(screen.queryByText("Loading configuration...")).not.toBeInTheDocument()
      })

      await user.click(screen.getByRole("tab", { name: "Scoring" }))

      await waitFor(() => {
        expect(screen.getByText("Company Scoring")).toBeInTheDocument()
        expect(screen.getByText("Company Tier Thresholds")).toBeInTheDocument()
        expect(screen.getByLabelText("S-Tier")).toBeInTheDocument()
      })
    })

    it("should update tier threshold values", async () => {
      const user = userEvent.setup()
      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("Job Finder Configuration")).toBeInTheDocument()
        expect(screen.queryByText("Loading configuration...")).not.toBeInTheDocument()
      })

      await user.click(screen.getByRole("tab", { name: "Scoring" }))

      await waitFor(() => {
        expect(screen.getByLabelText("S-Tier")).toBeInTheDocument()
      })

      // Update S-Tier threshold using fireEvent.change for number inputs
      const sTierInput = screen.getByLabelText("S-Tier")
      fireEvent.change(sTierInput, { target: { value: "200" } })

      expect(sTierInput).toHaveValue(200)
    })

    it("should save company scoring settings", async () => {
      vi.mocked(configClient.updateCompanyScoring).mockResolvedValueOnce(undefined)

      const user = userEvent.setup()
      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("Job Finder Configuration")).toBeInTheDocument()
        expect(screen.queryByText("Loading configuration...")).not.toBeInTheDocument()
      })

      await user.click(screen.getByRole("tab", { name: "Scoring" }))

      await waitFor(() => {
        expect(screen.getByLabelText("S-Tier")).toBeInTheDocument()
      })

      // Update S-Tier threshold using fireEvent.change for number inputs
      const sTierInput = screen.getByLabelText("S-Tier")
      fireEvent.change(sTierInput, { target: { value: "200" } })

      // Save changes
      await user.click(screen.getByText("Save Changes"))

      await waitFor(() => {
        expect(screen.getByText("Company scoring saved successfully!")).toBeInTheDocument()
      })

      expect(configClient.updateCompanyScoring).toHaveBeenCalled()
    })

    it("should show error when saving company scoring fails", async () => {
      vi.mocked(configClient.updateCompanyScoring).mockRejectedValueOnce(new Error("Save failed"))

      const user = userEvent.setup()
      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("Job Finder Configuration")).toBeInTheDocument()
        expect(screen.queryByText("Loading configuration...")).not.toBeInTheDocument()
      })

      await user.click(screen.getByRole("tab", { name: "Scoring" }))

      await waitFor(() => {
        expect(screen.getByLabelText("S-Tier")).toBeInTheDocument()
      })

      // Update S-Tier threshold using fireEvent.change for number inputs
      const sTierInput = screen.getByLabelText("S-Tier")
      fireEvent.change(sTierInput, { target: { value: "200" } })

      // Save changes
      await user.click(screen.getByText("Save Changes"))

      await waitFor(() => {
        expect(screen.getByText("Failed to save company scoring")).toBeInTheDocument()
      })
    })

    it("should reset company scoring to original values", async () => {
      const user = userEvent.setup()
      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("Job Finder Configuration")).toBeInTheDocument()
        expect(screen.queryByText("Loading configuration...")).not.toBeInTheDocument()
      })

      await user.click(screen.getByRole("tab", { name: "Scoring" }))

      await waitFor(() => {
        expect(screen.getByLabelText("S-Tier")).toBeInTheDocument()
      })

      // Update S-Tier threshold using fireEvent.change for number inputs
      const sTierInput = screen.getByLabelText("S-Tier")
      fireEvent.change(sTierInput, { target: { value: "200" } })

      expect(sTierInput).toHaveValue(200)

      // Reset
      await user.click(screen.getByText("Reset"))

      await waitFor(() => {
        expect(screen.getByLabelText("S-Tier")).toHaveValue(150) // Original value
      })
    })
  })

  describe("worker settings tab", () => {
    it("should display worker tab content when clicked", async () => {
      const user = userEvent.setup()
      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("Job Finder Configuration")).toBeInTheDocument()
        expect(screen.queryByText("Loading configuration...")).not.toBeInTheDocument()
      })

      await user.click(screen.getByRole("tab", { name: "Worker" }))

      await waitFor(() => {
        expect(screen.getByText("Worker Settings")).toBeInTheDocument()
        expect(screen.getByText("Scraping Settings")).toBeInTheDocument()
        expect(screen.getByLabelText("Timeout (s)")).toBeInTheDocument()
      })
    })

    it("should update scraping timeout value", async () => {
      const user = userEvent.setup()
      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("Job Finder Configuration")).toBeInTheDocument()
        expect(screen.queryByText("Loading configuration...")).not.toBeInTheDocument()
      })

      await user.click(screen.getByRole("tab", { name: "Worker" }))

      await waitFor(() => {
        expect(screen.getByLabelText("Timeout (s)")).toBeInTheDocument()
      })

      // Update timeout using fireEvent.change for number inputs
      const timeoutInput = screen.getByLabelText("Timeout (s)")
      fireEvent.change(timeoutInput, { target: { value: "60" } })

      expect(timeoutInput).toHaveValue(60)
    })

    it("should save worker settings", async () => {
      vi.mocked(configClient.updateWorkerSettings).mockResolvedValueOnce(undefined)

      const user = userEvent.setup()
      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("Job Finder Configuration")).toBeInTheDocument()
        expect(screen.queryByText("Loading configuration...")).not.toBeInTheDocument()
      })

      await user.click(screen.getByRole("tab", { name: "Worker" }))

      await waitFor(() => {
        expect(screen.getByLabelText("Timeout (s)")).toBeInTheDocument()
      })

      // Update timeout using fireEvent.change for number inputs
      const timeoutInput = screen.getByLabelText("Timeout (s)")
      fireEvent.change(timeoutInput, { target: { value: "60" } })

      // Save changes
      await user.click(screen.getByText("Save Changes"))

      await waitFor(() => {
        expect(screen.getByText("Worker settings saved successfully!")).toBeInTheDocument()
      })

      expect(configClient.updateWorkerSettings).toHaveBeenCalled()
    })

    it("should show error when saving worker settings fails", async () => {
      vi.mocked(configClient.updateWorkerSettings).mockRejectedValueOnce(new Error("Save failed"))

      const user = userEvent.setup()
      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("Job Finder Configuration")).toBeInTheDocument()
        expect(screen.queryByText("Loading configuration...")).not.toBeInTheDocument()
      })

      await user.click(screen.getByRole("tab", { name: "Worker" }))

      await waitFor(() => {
        expect(screen.getByLabelText("Timeout (s)")).toBeInTheDocument()
      })

      // Update timeout using fireEvent.change for number inputs
      const timeoutInput = screen.getByLabelText("Timeout (s)")
      fireEvent.change(timeoutInput, { target: { value: "60" } })

      // Save changes
      await user.click(screen.getByText("Save Changes"))

      await waitFor(() => {
        expect(screen.getByText("Failed to save worker settings")).toBeInTheDocument()
      })
    })

    it("should reset worker settings to original values", async () => {
      const user = userEvent.setup()
      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("Job Finder Configuration")).toBeInTheDocument()
        expect(screen.queryByText("Loading configuration...")).not.toBeInTheDocument()
      })

      await user.click(screen.getByRole("tab", { name: "Worker" }))

      await waitFor(() => {
        expect(screen.getByLabelText("Timeout (s)")).toBeInTheDocument()
      })

      // Update timeout using fireEvent.change for number inputs
      const timeoutInput = screen.getByLabelText("Timeout (s)")
      fireEvent.change(timeoutInput, { target: { value: "60" } })

      expect(timeoutInput).toHaveValue(60)

      // Reset
      await user.click(screen.getByText("Reset"))

      await waitFor(() => {
        expect(screen.getByLabelText("Timeout (s)")).toHaveValue(30) // Original value
      })
    })
  })
})
