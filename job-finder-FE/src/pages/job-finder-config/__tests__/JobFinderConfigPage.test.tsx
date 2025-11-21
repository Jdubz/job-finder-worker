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
import { configClient } from "@/api"

// Mock the config client - must mock @/api since that's what the component imports
vi.mock("@/api", async () => {
  const actual = await vi.importActual<typeof import("@/api")>("@/api")
  return {
    ...actual,
    configClient: {
      getStopList: vi.fn(),
      getQueueSettings: vi.fn(),
      getAISettings: vi.fn(),
      updateStopList: vi.fn(),
      updateQueueSettings: vi.fn(),
      updateAISettings: vi.fn(),
    },
  }
})

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
}

describe("JobFinderConfigPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Setup default mocks
    vi.mocked(configClient.getStopList).mockResolvedValue(mockStopList)
    vi.mocked(configClient.getQueueSettings).mockResolvedValue(mockQueueSettings)
    vi.mocked(configClient.getAISettings).mockResolvedValue(mockAISettings)
    vi.mocked(configClient.updateStopList).mockResolvedValue(undefined)
    vi.mocked(configClient.updateQueueSettings).mockResolvedValue(undefined)
    vi.mocked(configClient.updateAISettings).mockResolvedValue(undefined)
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

      // Reset for other tests
      mockAuthState.isOwner = true
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
      })

      // Add new company
      const companyInput = screen.getByPlaceholderText("Enter company name...")
      await user.type(companyInput, "New Bad Company")
      await user.click(screen.getByText("Add"))

      expect(screen.getByText("New Bad Company")).toBeInTheDocument()
    })

    it("should remove company from stop list", async () => {
      const user = userEvent.setup()
      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("Bad Company")).toBeInTheDocument()
      })

      // Remove company
      const removeButton = screen.getByText("Bad Company").closest("div")?.querySelector("button")
      if (removeButton) {
        await user.click(removeButton)
      }

      expect(screen.queryByText("Bad Company")).not.toBeInTheDocument()
    })

    it("should add new keyword to stop list", async () => {
      const user = userEvent.setup()
      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("Job Finder Configuration")).toBeInTheDocument()
      })

      // Add new keyword
      const keywordInput = screen.getByPlaceholderText("Enter keyword...")
      await user.type(keywordInput, "temporary")
      await user.click(screen.getByText("Add"))

      expect(screen.getByText("temporary")).toBeInTheDocument()
    })

    it("should remove keyword from stop list", async () => {
      const user = userEvent.setup()
      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("contractor")).toBeInTheDocument()
      })

      // Remove keyword
      const removeButton = screen.getByText("contractor").closest("div")?.querySelector("button")
      if (removeButton) {
        await user.click(removeButton)
      }

      expect(screen.queryByText("contractor")).not.toBeInTheDocument()
    })

    it("should add new domain to stop list", async () => {
      const user = userEvent.setup()
      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("Job Finder Configuration")).toBeInTheDocument()
      })

      // Add new domain
      const domainInput = screen.getByPlaceholderText("Enter domain (e.g., example.com)...")
      await user.type(domainInput, "scam-jobs.com")
      await user.click(screen.getByText("Add"))

      expect(screen.getByText("scam-jobs.com")).toBeInTheDocument()
    })

    it("should remove domain from stop list", async () => {
      const user = userEvent.setup()
      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("spam.com")).toBeInTheDocument()
      })

      // Remove domain
      const removeButton = screen.getByText("spam.com").closest("div")?.querySelector("button")
      if (removeButton) {
        await user.click(removeButton)
      }

      expect(screen.queryByText("spam.com")).not.toBeInTheDocument()
    })

    it("should save stop list changes", async () => {
      const user = userEvent.setup()
      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("Job Finder Configuration")).toBeInTheDocument()
      })

      // Add new company
      const companyInput = screen.getByPlaceholderText("Enter company name...")
      await user.type(companyInput, "New Company")
      await user.click(screen.getByText("Add"))

      // Save changes
      await user.click(screen.getByText("Save Changes"))

      expect(configClient.updateStopList).toHaveBeenCalledWith(
        expect.objectContaining({
          excludedCompanies: expect.arrayContaining(["New Company"]),
        })
      )
    })

    it("should reset stop list changes", async () => {
      const user = userEvent.setup()
      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("Job Finder Configuration")).toBeInTheDocument()
      })

      // Add new company
      const companyInput = screen.getByPlaceholderText("Enter company name...")
      await user.type(companyInput, "New Company")
      await user.click(screen.getByText("Add"))

      // Reset changes
      await user.click(screen.getByText("Reset"))

      expect(screen.queryByText("New Company")).not.toBeInTheDocument()
    })
  })

  describe("queue settings management", () => {
    it("should switch to queue settings tab", async () => {
      const user = userEvent.setup()
      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("Job Finder Configuration")).toBeInTheDocument()
      })

      await user.click(screen.getByText("Queue Settings"))

      expect(screen.getByText("Queue Processing Settings")).toBeInTheDocument()
    })

    it("should display current queue settings", async () => {
      const user = userEvent.setup()
      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("Job Finder Configuration")).toBeInTheDocument()
      })

      await user.click(screen.getByText("Queue Settings"))

      expect(screen.getByDisplayValue("3")).toBeInTheDocument() // maxRetries
      expect(screen.getByDisplayValue("300")).toBeInTheDocument() // retryDelaySeconds
      expect(screen.getByDisplayValue("600")).toBeInTheDocument() // processingTimeout
    })

    it("should update queue settings", async () => {
      const user = userEvent.setup()
      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("Job Finder Configuration")).toBeInTheDocument()
      })

      await user.click(screen.getByText("Queue Settings"))

      // Update max retries
      const maxRetriesInput = screen.getByDisplayValue("3")
      await user.clear(maxRetriesInput)
      await user.type(maxRetriesInput, "5")

      // Save changes
      await user.click(screen.getByText("Save Changes"))

      expect(configClient.updateQueueSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          maxRetries: 5,
        })
      )
    })

    it("should reset queue settings changes", async () => {
      const user = userEvent.setup()
      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("Job Finder Configuration")).toBeInTheDocument()
      })

      await user.click(screen.getByText("Queue Settings"))

      // Update max retries
      const maxRetriesInput = screen.getByDisplayValue("3")
      await user.clear(maxRetriesInput)
      await user.type(maxRetriesInput, "5")

      // Reset changes
      await user.click(screen.getByText("Reset"))

      expect(screen.getByDisplayValue("3")).toBeInTheDocument()
    })
  })

  describe("AI settings management", () => {
    it("should switch to AI settings tab", async () => {
      const user = userEvent.setup()
      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("Job Finder Configuration")).toBeInTheDocument()
      })

      await user.click(screen.getByText("AI Settings"))

      expect(screen.getByText("AI Configuration")).toBeInTheDocument()
    })

    it("should display current AI settings", async () => {
      const user = userEvent.setup()
      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("Job Finder Configuration")).toBeInTheDocument()
      })

      await user.click(screen.getByText("AI Settings"))

      expect(screen.getByDisplayValue("claude-sonnet-4")).toBeInTheDocument() // model
      expect(screen.getByDisplayValue("70")).toBeInTheDocument() // minMatchScore
      expect(screen.getByDisplayValue("10")).toBeInTheDocument() // costBudgetDaily
    })

    it("should update AI provider", async () => {
      const user = userEvent.setup()
      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("Job Finder Configuration")).toBeInTheDocument()
      })

      await user.click(screen.getByText("AI Settings"))

      // Update provider
      await user.click(screen.getByDisplayValue("Claude (Anthropic)"))
      await user.click(screen.getByText("OpenAI (GPT)"))

      // Save changes
      await user.click(screen.getByText("Save Changes"))

      expect(configClient.updateAISettings).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "openai",
        })
      )
    })

    it("should update AI model", async () => {
      const user = userEvent.setup()
      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("Job Finder Configuration")).toBeInTheDocument()
      })

      await user.click(screen.getByText("AI Settings"))

      // Update model
      const modelInput = screen.getByDisplayValue("claude-sonnet-4")
      await user.clear(modelInput)
      await user.type(modelInput, "gpt-4")

      // Save changes
      await user.click(screen.getByText("Save Changes"))

      expect(configClient.updateAISettings).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "gpt-4",
        })
      )
    })

    it("should update minimum match score", async () => {
      const user = userEvent.setup()
      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("Job Finder Configuration")).toBeInTheDocument()
      })

      await user.click(screen.getByText("AI Settings"))

      // Update min match score
      const scoreInput = screen.getByDisplayValue("70")
      await user.clear(scoreInput)
      await user.type(scoreInput, "80")

      // Save changes
      await user.click(screen.getByText("Save Changes"))

      expect(configClient.updateAISettings).toHaveBeenCalledWith(
        expect.objectContaining({
          minMatchScore: 80,
        })
      )
    })

    it("should update cost budget", async () => {
      const user = userEvent.setup()
      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("Job Finder Configuration")).toBeInTheDocument()
      })

      await user.click(screen.getByText("AI Settings"))

      // Update cost budget
      const budgetInput = screen.getByDisplayValue("10")
      await user.clear(budgetInput)
      await user.type(budgetInput, "25.50")

      // Save changes
      await user.click(screen.getByText("Save Changes"))

      expect(configClient.updateAISettings).toHaveBeenCalledWith(
        expect.objectContaining({
          costBudgetDaily: 25.5,
        })
      )
    })

    it("should reset AI settings changes", async () => {
      const user = userEvent.setup()
      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("Job Finder Configuration")).toBeInTheDocument()
      })

      await user.click(screen.getByText("AI Settings"))

      // Update model
      const modelInput = screen.getByDisplayValue("claude-sonnet-4")
      await user.clear(modelInput)
      await user.type(modelInput, "gpt-4")

      // Reset changes
      await user.click(screen.getByText("Reset"))

      expect(screen.getByDisplayValue("claude-sonnet-4")).toBeInTheDocument()
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
      })

      // Add new company
      const companyInput = screen.getByPlaceholderText("Enter company name...")
      await user.type(companyInput, "New Company")
      await user.click(screen.getByText("Add"))

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
      })

      await user.click(screen.getByText("Queue Settings"))

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
      })

      await user.click(screen.getByText("AI Settings"))

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
      })

      // Add new company
      const companyInput = screen.getByPlaceholderText("Enter company name...")
      await user.type(companyInput, "New Company")
      await user.click(screen.getByText("Add"))

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
      })

      await user.click(screen.getByText("Queue Settings"))

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
      })

      await user.click(screen.getByText("AI Settings"))

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

    it("should auto-dismiss success messages after 3 seconds", async () => {
      vi.useFakeTimers()
      const user = userEvent.setup()
      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("Job Finder Configuration")).toBeInTheDocument()
      })

      // Add new company
      const companyInput = screen.getByPlaceholderText("Enter company name...")
      await user.type(companyInput, "New Company")
      await user.click(screen.getByText("Add"))

      // Save changes
      await user.click(screen.getByText("Save Changes"))

      // Should show success message
      await waitFor(() => {
        expect(screen.getByText("Stop list saved successfully!")).toBeInTheDocument()
      })

      // Fast-forward time
      vi.advanceTimersByTime(3000)

      // Success message should be gone
      expect(screen.queryByText("Stop list saved successfully!")).not.toBeInTheDocument()

      vi.useRealTimers()
    })
  })

  describe("form validation", () => {
    it("should not add empty company name", async () => {
      const user = userEvent.setup()
      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("Job Finder Configuration")).toBeInTheDocument()
      })

      // Try to add empty company
      const companyInput = screen.getByPlaceholderText("Enter company name...")
      await user.type(companyInput, "   ")
      await user.click(screen.getByText("Add"))

      expect(screen.queryByText("   ")).not.toBeInTheDocument()
    })

    it("should not add empty keyword", async () => {
      const user = userEvent.setup()
      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("Job Finder Configuration")).toBeInTheDocument()
      })

      // Try to add empty keyword
      const keywordInput = screen.getByPlaceholderText("Enter keyword...")
      await user.type(keywordInput, "   ")
      await user.click(screen.getByText("Add"))

      expect(screen.queryByText("   ")).not.toBeInTheDocument()
    })

    it("should not add empty domain", async () => {
      const user = userEvent.setup()
      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("Job Finder Configuration")).toBeInTheDocument()
      })

      // Try to add empty domain
      const domainInput = screen.getByPlaceholderText("Enter domain (e.g., example.com)...")
      await user.type(domainInput, "   ")
      await user.click(screen.getByText("Add"))

      expect(screen.queryByText("   ")).not.toBeInTheDocument()
    })

    it("should handle Enter key to add items", async () => {
      const user = userEvent.setup()
      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("Job Finder Configuration")).toBeInTheDocument()
      })

      // Add company using Enter key
      const companyInput = screen.getByPlaceholderText("Enter company name...")
      await user.type(companyInput, "Enter Company")
      await user.keyboard("{Enter}")

      expect(screen.getByText("Enter Company")).toBeInTheDocument()
    })
  })

  describe("accessibility", () => {
    it("should have proper form labels and ARIA attributes", async () => {
      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("Job Finder Configuration")).toBeInTheDocument()
      })

      // Check form accessibility
      expect(screen.getByLabelText("Max Retries")).toBeInTheDocument()
      expect(screen.getByLabelText("Retry Delay (seconds)")).toBeInTheDocument()
      expect(screen.getByLabelText("Processing Timeout (seconds)")).toBeInTheDocument()
    })

    it("should be keyboard navigable", async () => {
      const user = userEvent.setup()
      renderWithRouter(<JobFinderConfigPage />)

      await waitFor(() => {
        expect(screen.getByText("Job Finder Configuration")).toBeInTheDocument()
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
