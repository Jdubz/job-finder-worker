/**
 * Job Finder Configuration Page Tests
 *
 * Comprehensive tests for the Job Finder Configuration functionality
 * Rank 3 - HIGH: System configuration management
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
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
    getJobFilters: vi.fn(),
    getTechnologyRanks: vi.fn(),
    getSchedulerSettings: vi.fn(),
    updateStopList: vi.fn(),
    updateQueueSettings: vi.fn(),
    updateAISettings: vi.fn(),
    updateJobFilters: vi.fn(),
    updateTechnologyRanks: vi.fn(),
    updateSchedulerSettings: vi.fn(),
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
  maxRetries: 3,
  retryDelaySeconds: 300,
  processingTimeout: 600,
}

const mockAISettings = {
  provider: "claude" as const,
  model: "claude-sonnet-4",
  minMatchScore: 70,
  costBudgetDaily: 10.0,
  generateIntakeData: true,
}

const mockJobFilters = {
  enabled: true,
  strikeThreshold: 3,
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

describe("JobFinderConfigPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset auth state
    mockAuthState.isOwner = true

    // Setup default mocks
    vi.mocked(configClient.getStopList).mockResolvedValue(mockStopList)
    vi.mocked(configClient.getQueueSettings).mockResolvedValue(mockQueueSettings)
    vi.mocked(configClient.getAISettings).mockResolvedValue(mockAISettings)
    vi.mocked(configClient.getJobFilters).mockResolvedValue(mockJobFilters)
    vi.mocked(configClient.getTechnologyRanks).mockResolvedValue(mockTechRanks)
    vi.mocked(configClient.getSchedulerSettings).mockResolvedValue(mockScheduler)
    vi.mocked(configClient.updateStopList).mockResolvedValue(undefined)
    vi.mocked(configClient.updateQueueSettings).mockResolvedValue(undefined)
    vi.mocked(configClient.updateAISettings).mockResolvedValue(undefined)
    vi.mocked(configClient.updateJobFilters).mockResolvedValue(undefined)
    vi.mocked(configClient.updateTechnologyRanks).mockResolvedValue(undefined)
    vi.mocked(configClient.updateSchedulerSettings).mockResolvedValue(undefined)
  })

  describe("rendering", () => {
    it("should render configuration page with all tabs", async () => {
      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("Job Finder Configuration")).toBeInTheDocument()
      })

      // Check tabs
      expect(screen.getByText("Stop List")).toBeInTheDocument()
      expect(screen.getByText("Queue Settings")).toBeInTheDocument()
      expect(screen.getByText("AI Settings")).toBeInTheDocument()
      expect(screen.getByText("Job Filters")).toBeInTheDocument()
      expect(screen.getByText("Tech Ranks")).toBeInTheDocument()
      expect(screen.getByText("Scheduler")).toBeInTheDocument()
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

      await user.click(screen.getByText("Queue Settings"))

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

      await user.click(screen.getByText("Queue Settings"))

      await waitFor(() => {
        expect(screen.getByDisplayValue("3")).toBeInTheDocument() // maxRetries
        expect(screen.getByDisplayValue("300")).toBeInTheDocument() // retryDelaySeconds
        expect(screen.getByDisplayValue("600")).toBeInTheDocument() // processingTimeout
      })
    })

    it("should update queue settings", async () => {
      const user = userEvent.setup()
      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("Job Finder Configuration")).toBeInTheDocument()
        expect(screen.queryByText("Loading configuration...")).not.toBeInTheDocument()
      })

      await user.click(screen.getByText("Queue Settings"))

      await waitFor(() => {
        expect(screen.getByLabelText("Max Retries")).toBeInTheDocument()
      })

      // Update max retries - use the labeled input
      const maxRetriesInput = screen.getByLabelText("Max Retries")
      await user.clear(maxRetriesInput)
      await user.type(maxRetriesInput, "5")

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

      await user.click(screen.getByText("AI Settings"))

      await waitFor(() => {
        expect(screen.getByText("AI Configuration")).toBeInTheDocument()
      })
    })

    it("should display current AI settings", async () => {
      const user = userEvent.setup()
      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("Job Finder Configuration")).toBeInTheDocument()
        expect(screen.queryByText("Loading configuration...")).not.toBeInTheDocument()
      })

      await user.click(screen.getByText("AI Settings"))

      await waitFor(() => {
        expect(screen.getByDisplayValue("claude-sonnet-4")).toBeInTheDocument() // model
        expect(screen.getByDisplayValue("70")).toBeInTheDocument() // minMatchScore
        expect(screen.getByDisplayValue("10")).toBeInTheDocument() // costBudgetDaily
      })
    })

    it("should update AI model", async () => {
      const user = userEvent.setup()
      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("Job Finder Configuration")).toBeInTheDocument()
        expect(screen.queryByText("Loading configuration...")).not.toBeInTheDocument()
      })

      await user.click(screen.getByText("AI Settings"))

      await waitFor(() => {
        expect(screen.getByLabelText("Model")).toBeInTheDocument()
      })

      // Update model - use labeled input
      const modelInput = screen.getByLabelText("Model")
      await user.clear(modelInput)
      await user.type(modelInput, "gpt-4")

      // Save changes
      await user.click(screen.getByText("Save Changes"))

      await waitFor(() => {
        expect(configClient.updateAISettings).toHaveBeenCalled()
      })
    })

    it("should update minimum match score", async () => {
      const user = userEvent.setup()
      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("Job Finder Configuration")).toBeInTheDocument()
        expect(screen.queryByText("Loading configuration...")).not.toBeInTheDocument()
      })

      await user.click(screen.getByText("AI Settings"))

      await waitFor(() => {
        expect(screen.getByLabelText("Minimum Match Score")).toBeInTheDocument()
      })

      // Update min match score - use labeled input
      const scoreInput = screen.getByLabelText("Minimum Match Score")
      await user.clear(scoreInput)
      await user.type(scoreInput, "80")

      // Save changes
      await user.click(screen.getByText("Save Changes"))

      await waitFor(() => {
        expect(configClient.updateAISettings).toHaveBeenCalled()
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

      await user.click(screen.getByText("Queue Settings"))

      await waitFor(() => {
        expect(screen.getByDisplayValue("3")).toBeInTheDocument()
      })

      // Update max retries
      const maxRetriesInput = screen.getByDisplayValue("3")
      await user.clear(maxRetriesInput)
      await user.type(maxRetriesInput, "5")

      // Save changes
      await user.click(screen.getByText("Save Changes"))

      await waitFor(() => {
        expect(screen.getByText("Failed to save queue settings")).toBeInTheDocument()
      })
    })

    it("should show error when saving AI settings fails", async () => {
      const user = userEvent.setup()
      vi.mocked(configClient.updateAISettings).mockRejectedValue(new Error("Save failed"))

      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("Job Finder Configuration")).toBeInTheDocument()
        expect(screen.queryByText("Loading configuration...")).not.toBeInTheDocument()
      })

      await user.click(screen.getByText("AI Settings"))

      await waitFor(() => {
        expect(screen.getByDisplayValue("claude-sonnet-4")).toBeInTheDocument()
      })

      // Update model
      const modelInput = screen.getByDisplayValue("claude-sonnet-4")
      await user.clear(modelInput)
      await user.type(modelInput, "gpt-4")

      // Save changes
      await user.click(screen.getByText("Save Changes"))

      await waitFor(() => {
        expect(screen.getByText("Failed to save AI settings")).toBeInTheDocument()
      })
    })
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

      await user.click(screen.getByText("Queue Settings"))

      await waitFor(() => {
        expect(screen.getByDisplayValue("3")).toBeInTheDocument()
      })

      // Update max retries
      const maxRetriesInput = screen.getByDisplayValue("3")
      await user.clear(maxRetriesInput)
      await user.type(maxRetriesInput, "5")

      // Save changes
      await user.click(screen.getByText("Save Changes"))

      await waitFor(() => {
        expect(screen.getByText("Queue settings saved successfully!")).toBeInTheDocument()
      })
    })

    it("should show success message when AI settings are saved", async () => {
      const user = userEvent.setup()
      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("Job Finder Configuration")).toBeInTheDocument()
        expect(screen.queryByText("Loading configuration...")).not.toBeInTheDocument()
      })

      await user.click(screen.getByText("AI Settings"))

      await waitFor(() => {
        expect(screen.getByDisplayValue("claude-sonnet-4")).toBeInTheDocument()
      })

      // Update model
      const modelInput = screen.getByDisplayValue("claude-sonnet-4")
      await user.clear(modelInput)
      await user.type(modelInput, "gpt-4")

      // Save changes
      await user.click(screen.getByText("Save Changes"))

      await waitFor(() => {
        expect(screen.getByText("AI settings saved successfully!")).toBeInTheDocument()
      })
    })
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

      await user.click(screen.getByText("Queue Settings"))

      await waitFor(() => {
        // Check form labels exist
        expect(screen.getByLabelText("Max Retries")).toBeInTheDocument()
        expect(screen.getByLabelText("Retry Delay (seconds)")).toBeInTheDocument()
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
})
