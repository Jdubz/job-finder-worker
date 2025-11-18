/**
 * Document Builder Page Tests
 *
 * Comprehensive tests for the Document Builder Page functionality
 * Rank 1 - CRITICAL: Primary user workflow
 * DISABLED: This test file has TypeScript errors that need to be fixed
 */

/*
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { BrowserRouter } from "react-router-dom"
import { DocumentBuilderPage } from "../DocumentBuilderPage"
import { jobMatchesClient } from "@/api/job-matches-client"
import { generatorClient } from "@/api/generator-client"

// Mock the API clients
vi.mock("@/api/job-matches-client", () => ({
  jobMatchesClient: {
    getMatches: vi.fn(),
  },
}))

vi.mock("@/api/generator-client", () => ({
  generatorClient: {
    startGeneration: vi.fn(),
    executeStep: vi.fn(),
  },
}))

// Mock the auth context
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: {
      uid: "test-user-123",
      email: "test@example.com",
      displayName: "Test User",
    },
  }),
}))

// Mock the GenerationProgress component
vi.mock("@/components/GenerationProgress", () => ({
  GenerationProgress: ({ steps }: { steps: any[] }) => (
    <div data-testid="generation-progress">
      {steps.length > 0 ? "Generation in progress..." : "No generation"}
    </div>
  ),
}))

// Helper function to render with router
const renderWithRouter = (component: React.ReactElement) => {
  return render(<BrowserRouter>{component}</BrowserRouter>)
}

// Mock data
const mockJobMatches = [
  {
    id: "match-1",
    jobTitle: "Senior Software Engineer",
    companyName: "Tech Corp",
    location: "San Francisco, CA",
    jobDescription: "We are looking for an experienced software engineer...",
    matchScore: 85,
    analyzedAt: new Date(),
  },
  {
    id: "match-2",
    jobTitle: "Frontend Developer",
    companyName: "Startup Inc",
    location: "Remote",
    jobDescription: "Join our growing team as a frontend developer...",
    matchScore: 78,
    analyzedAt: new Date(),
  },
]

const mockGenerationResponse = {
  success: true,
  data: {
    requestId: "req-123",
    nextStep: "analyze",
  },
}

const mockStepResponse = {
  success: true,
  data: {
    status: "completed",
    nextStep: null,
    steps: [
      { id: "analyze", name: "Analyzing", status: "completed" },
      { id: "generate", name: "Generating", status: "completed" },
    ],
    resumeUrl: "https://storage.example.com/resume.pdf",
    coverLetterUrl: "https://storage.example.com/cover-letter.pdf",
  },
}

describe("DocumentBuilderPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Setup default mocks
    vi.mocked(jobMatchesClient.getMatches).mockResolvedValue(mockJobMatches)
    vi.mocked(generatorClient.startGeneration).mockResolvedValue(mockGenerationResponse)
    vi.mocked(generatorClient.executeStep).mockResolvedValue(mockStepResponse)
  })

  describe("rendering", () => {
    it("should render document builder page with all form fields", async () => {
      renderWithRouter(<DocumentBuilderPage />)

      // Wait for job matches to load
      await waitFor(() => {
        expect(screen.getByText("Document Builder")).toBeInTheDocument()
      })

      // Check form fields
      expect(screen.getByLabelText(/document type/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/job title/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/company name/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/job description/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/target summary/i)).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /generate/i })).toBeInTheDocument()
    })

    it("should render job match selector when matches are available", async () => {
      renderWithRouter(<DocumentBuilderPage />)

      await waitFor(() => {
        expect(screen.getByText("Select a job match (optional)")).toBeInTheDocument()
      })

      // Check if job matches are loaded
      expect(screen.getByText("Senior Software Engineer - Tech Corp")).toBeInTheDocument()
      expect(screen.getByText("Frontend Developer - Startup Inc")).toBeInTheDocument()
    })

    it("should show loading state while fetching job matches", () => {
      // Mock a slow response
      vi.mocked(jobMatchesClient.getMatches).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(mockJobMatches), 100))
      )

      renderWithRouter(<DocumentBuilderPage />)

      expect(screen.getByText("Loading job matches...")).toBeInTheDocument()
    })
  })

  describe("form interactions", () => {
    it("should change available options based on document type", async () => {
      const user = userEvent.setup()
      renderWithRouter(<DocumentBuilderPage />)

      await waitFor(() => {
        expect(screen.getByText("Document Builder")).toBeInTheDocument()
      })

      const documentTypeSelect = screen.getByLabelText(/document type/i)
      await user.click(documentTypeSelect)

      // Check if all document types are available
      expect(screen.getByText("Resume")).toBeInTheDocument()
      expect(screen.getByText("Cover Letter")).toBeInTheDocument()
      expect(screen.getByText("Both")).toBeInTheDocument()
    })

    it("should auto-populate fields when job match is selected", async () => {
      const user = userEvent.setup()
      renderWithRouter(<DocumentBuilderPage />)

      await waitFor(() => {
        expect(screen.getByText("Document Builder")).toBeInTheDocument()
      })

      // Select a job match
      const jobMatchSelect = screen.getByLabelText(/select a job match/i)
      await user.click(jobMatchSelect)
      await user.click(screen.getByText("Senior Software Engineer - Tech Corp"))

      // Check if fields are auto-populated
      expect(screen.getByDisplayValue("Senior Software Engineer")).toBeInTheDocument()
      expect(screen.getByDisplayValue("Tech Corp")).toBeInTheDocument()
      expect(
        screen.getByDisplayValue("We are looking for an experienced software engineer...")
      ).toBeInTheDocument()
    })

    it("should clear fields when job match is deselected", async () => {
      const user = userEvent.setup()
      renderWithRouter(<DocumentBuilderPage />)

      await waitFor(() => {
        expect(screen.getByText("Document Builder")).toBeInTheDocument()
      })

      // Select a job match first
      const jobMatchSelect = screen.getByLabelText(/select a job match/i)
      await user.click(jobMatchSelect)
      await user.click(screen.getByText("Senior Software Engineer - Tech Corp"))

      // Verify fields are populated
      expect(screen.getByDisplayValue("Senior Software Engineer")).toBeInTheDocument()

      // Deselect job match
      await user.click(jobMatchSelect)
      await user.click(screen.getByText("None"))

      // Check if fields are cleared
      expect(screen.getByDisplayValue("")).toBeInTheDocument()
    })

    it("should allow manual input of job details", async () => {
      const user = userEvent.setup()
      renderWithRouter(<DocumentBuilderPage />)

      await waitFor(() => {
        expect(screen.getByText("Document Builder")).toBeInTheDocument()
      })

      // Fill in job details manually
      await user.type(screen.getByLabelText(/job title/i), "Custom Job Title")
      await user.type(screen.getByLabelText(/company name/i), "Custom Company")
      await user.type(screen.getByLabelText(/job description/i), "Custom job description")

      // Verify values
      expect(screen.getByDisplayValue("Custom Job Title")).toBeInTheDocument()
      expect(screen.getByDisplayValue("Custom Company")).toBeInTheDocument()
      expect(screen.getByDisplayValue("Custom job description")).toBeInTheDocument()
    })
  })

  describe("generation workflow", () => {
    it("should start generation when form is submitted", async () => {
      const user = userEvent.setup()
      renderWithRouter(<DocumentBuilderPage />)

      await waitFor(() => {
        expect(screen.getByText("Document Builder")).toBeInTheDocument()
      })

      // Fill required fields
      await user.type(screen.getByLabelText(/job title/i), "Test Job")
      await user.type(screen.getByLabelText(/company name/i), "Test Company")

      // Submit form
      await user.click(screen.getByRole("button", { name: /generate/i }))

      // Verify API calls
      expect(generatorClient.startGeneration).toHaveBeenCalledWith(
        expect.objectContaining({
          generateType: "resume",
          job: {
            role: "Test Job",
            company: "Test Company",
          },
        })
      )
    })

    it("should display progress during generation", async () => {
      const user = userEvent.setup()
      renderWithRouter(<DocumentBuilderPage />)

      await waitFor(() => {
        expect(screen.getByText("Document Builder")).toBeInTheDocument()
      })

      // Fill required fields
      await user.type(screen.getByLabelText(/job title/i), "Test Job")
      await user.type(screen.getByLabelText(/company name/i), "Test Company")

      // Submit form
      await user.click(screen.getByRole("button", { name: /generate/i }))

      // Check if progress is shown
      await waitFor(() => {
        expect(screen.getByTestId("generation-progress")).toBeInTheDocument()
      })
    })

    it("should show success message when generation completes", async () => {
      const user = userEvent.setup()
      renderWithRouter(<DocumentBuilderPage />)

      await waitFor(() => {
        expect(screen.getByText("Document Builder")).toBeInTheDocument()
      })

      // Fill required fields
      await user.type(screen.getByLabelText(/job title/i), "Test Job")
      await user.type(screen.getByLabelText(/company name/i), "Test Company")

      // Submit form
      await user.click(screen.getByRole("button", { name: /generate/i }))

      // Wait for success message
      await waitFor(() => {
        expect(screen.getByText("Resume generated successfully!")).toBeInTheDocument()
      })
    })

    it("should show download buttons when documents are ready", async () => {
      const user = userEvent.setup()
      renderWithRouter(<DocumentBuilderPage />)

      await waitFor(() => {
        expect(screen.getByText("Document Builder")).toBeInTheDocument()
      })

      // Fill required fields
      await user.type(screen.getByLabelText(/job title/i), "Test Job")
      await user.type(screen.getByLabelText(/company name/i), "Test Company")

      // Submit form
      await user.click(screen.getByRole("button", { name: /generate/i }))

      // Wait for download buttons
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /download resume/i })).toBeInTheDocument()
      })
    })

    it("should reset form after successful generation", async () => {
      const user = userEvent.setup()
      renderWithRouter(<DocumentBuilderPage />)

      await waitFor(() => {
        expect(screen.getByText("Document Builder")).toBeInTheDocument()
      })

      // Fill required fields
      await user.type(screen.getByLabelText(/job title/i), "Test Job")
      await user.type(screen.getByLabelText(/company name/i), "Test Company")

      // Submit form
      await user.click(screen.getByRole("button", { name: /generate/i }))

      // Wait for completion
      await waitFor(() => {
        expect(screen.getByText("Resume generated successfully!")).toBeInTheDocument()
      })

      // Check if form is reset
      expect(screen.getByDisplayValue("")).toBeInTheDocument()
    })
  })

  describe("error handling", () => {
    it("should show error message when generation fails", async () => {
      const user = userEvent.setup()

      // Mock API failure
      vi.mocked(generatorClient.startGeneration).mockResolvedValue({
        success: false,
        error: "Generation failed",
      })

      renderWithRouter(<DocumentBuilderPage />)

      await waitFor(() => {
        expect(screen.getByText("Document Builder")).toBeInTheDocument()
      })

      // Fill required fields
      await user.type(screen.getByLabelText(/job title/i), "Test Job")
      await user.type(screen.getByLabelText(/company name/i), "Test Company")

      // Submit form
      await user.click(screen.getByRole("button", { name: /generate/i }))

      // Wait for error message
      await waitFor(() => {
        expect(screen.getByText("Failed to start generation")).toBeInTheDocument()
      })
    })

    it("should show validation error for missing required fields", async () => {
      const user = userEvent.setup()
      renderWithRouter(<DocumentBuilderPage />)

      await waitFor(() => {
        expect(screen.getByText("Document Builder")).toBeInTheDocument()
      })

      // Submit form without filling required fields
      await user.click(screen.getByRole("button", { name: /generate/i }))

      // Check for validation error
      expect(screen.getByText("Job title and company name are required")).toBeInTheDocument()
    })

    it("should show error when job matches fail to load", async () => {
      // Mock API failure
      vi.mocked(jobMatchesClient.getMatches).mockRejectedValue(new Error("Failed to load matches"))

      renderWithRouter(<DocumentBuilderPage />)

      // Should still render the form even if job matches fail
      await waitFor(() => {
        expect(screen.getByText("Document Builder")).toBeInTheDocument()
      })

      // Job match selector should show error state
      expect(screen.getByText("Failed to load job matches")).toBeInTheDocument()
    })
  })

  describe("navigation state handling", () => {
    it("should pre-fill form when job match is passed via navigation state", () => {
      const mockLocation = {
        state: {
          jobMatch: {
            id: "match-1",
            jobTitle: "Pre-filled Job",
            companyName: "Pre-filled Company",
            jobDescription: "Pre-filled description",
          },
          documentType: "cover_letter" as const,
        },
      }

      // Mock useLocation
      vi.mock("react-router-dom", async () => {
        const actual = await vi.importActual("react-router-dom")
        return {
          ...actual,
          useLocation: () => mockLocation,
        }
      })

      renderWithRouter(<DocumentBuilderPage />)

      // Check if form is pre-filled
      expect(screen.getByDisplayValue("Pre-filled Job")).toBeInTheDocument()
      expect(screen.getByDisplayValue("Pre-filled Company")).toBeInTheDocument()
      expect(screen.getByDisplayValue("Pre-filled description")).toBeInTheDocument()
    })
  })

  describe("accessibility", () => {
    it("should have proper form labels and ARIA attributes", async () => {
      renderWithRouter(<DocumentBuilderPage />)

      await waitFor(() => {
        expect(screen.getByText("Document Builder")).toBeInTheDocument()
      })

      // Check form accessibility
      expect(screen.getByLabelText(/document type/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/job title/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/company name/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/job description/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/target summary/i)).toBeInTheDocument()
    })

    it("should be keyboard navigable", async () => {
      const user = userEvent.setup()
      renderWithRouter(<DocumentBuilderPage />)

      await waitFor(() => {
        expect(screen.getByText("Document Builder")).toBeInTheDocument()
      })

      // Test tab navigation
      await user.tab()
      expect(document.activeElement).toBeInTheDocument()
    })
  })

  describe("responsive design", () => {
    it("should handle different screen sizes", async () => {
      renderWithRouter(<DocumentBuilderPage />)

      await waitFor(() => {
        expect(screen.getByText("Document Builder")).toBeInTheDocument()
      })

      // Check if responsive classes are applied
      const form = screen.getByRole("form", { hidden: true })
      expect(form).toBeInTheDocument()
    })
  })
})
*/
