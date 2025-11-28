/**
 * Document Builder Page Tests
 *
 * Tests for the Document Builder page functionality
 */

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

// Mock the config
vi.mock("@/config/api", () => ({
  getAbsoluteArtifactUrl: (url: string) => url,
}))

// Helper function to render with router
const renderWithRouter = (component: React.ReactElement) => {
  return render(<BrowserRouter>{component}</BrowserRouter>)
}

// Lightweight manual retry helper for occasional async flake in long flows
const itWithRetry = (name: string, fn: () => Promise<void>, retries = 1) => {
  it(name, async () => {
    let lastError: unknown
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        await fn()
        return
      } catch (err) {
        lastError = err
      }
    }
    throw lastError
  })
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
    analyzedAt: new Date().toISOString(),
  },
  {
    id: "match-2",
    jobTitle: "Frontend Developer",
    companyName: "Startup Inc",
    location: "Remote",
    jobDescription: "Join our growing team as a frontend developer...",
    matchScore: 78,
    analyzedAt: new Date().toISOString(),
  },
]

const mockStartGenerationResponse = {
  success: true,
  data: {
    requestId: "req-123",
    nextStep: "generate-resume",
    steps: [
      { id: "collect-data", name: "Collect Data", status: "completed" },
      { id: "generate-resume", name: "Generate Resume", status: "pending" },
      { id: "render-pdf", name: "Render PDF", status: "pending" },
    ],
  },
}

const mockExecuteStepResponse = {
  success: true,
  data: {
    status: "completed",
    nextStep: null,
    steps: [
      { id: "collect-data", name: "Collect Data", status: "completed" },
      { id: "generate-resume", name: "Generate Resume", status: "completed" },
      { id: "render-pdf", name: "Render PDF", status: "completed" },
    ],
    resumeUrl: "/artifacts/resume.pdf",
  },
}

describe("DocumentBuilderPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(jobMatchesClient.getMatches).mockResolvedValue(mockJobMatches as any)
    vi.mocked(generatorClient.startGeneration).mockResolvedValue(mockStartGenerationResponse as any)
    vi.mocked(generatorClient.executeStep).mockResolvedValue(mockExecuteStepResponse as any)
  })

  describe("rendering", () => {
    it("should render document builder page with title", async () => {
      renderWithRouter(<DocumentBuilderPage />)

      await waitFor(() => {
        expect(screen.getByText("Document Builder")).toBeInTheDocument()
      })
    })

    it("should render all form fields", async () => {
      renderWithRouter(<DocumentBuilderPage />)

      await waitFor(() => {
        expect(screen.getByText("Document Type")).toBeInTheDocument()
        expect(screen.getByText("Select Job Match (Optional)")).toBeInTheDocument()
        expect(screen.getByLabelText(/job title/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/company name/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/job description/i)).toBeInTheDocument()
      })
    })

    it("should show loading state while fetching job matches", async () => {
      vi.mocked(jobMatchesClient.getMatches).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(mockJobMatches as any), 100))
      )

      renderWithRouter(<DocumentBuilderPage />)

      // Initially shows loading in the select dropdown
      expect(screen.getByText(/select a job match or enter manually/i)).toBeInTheDocument()
    })

    it("should load job matches on mount", async () => {
      renderWithRouter(<DocumentBuilderPage />)

      await waitFor(() => {
        expect(jobMatchesClient.getMatches).toHaveBeenCalledWith({
          minScore: 70,
          limit: 50,
        })
      })
    })
  })

  describe("form interactions", () => {
    it("should allow entering job title manually", async () => {
      const user = userEvent.setup()
      renderWithRouter(<DocumentBuilderPage />)

      await waitFor(() => {
        expect(screen.getByLabelText(/job title/i)).toBeInTheDocument()
      })

      const jobTitleInput = screen.getByLabelText(/job title/i)
      await user.type(jobTitleInput, "Custom Job Title")

      expect(jobTitleInput).toHaveValue("Custom Job Title")
    })

    it("should allow entering company name manually", async () => {
      const user = userEvent.setup()
      renderWithRouter(<DocumentBuilderPage />)

      await waitFor(() => {
        expect(screen.getByLabelText(/company name/i)).toBeInTheDocument()
      })

      const companyInput = screen.getByLabelText(/company name/i)
      await user.type(companyInput, "Custom Company")

      expect(companyInput).toHaveValue("Custom Company")
    })

    it("should clear form when Clear Form button is clicked", async () => {
      const user = userEvent.setup()
      renderWithRouter(<DocumentBuilderPage />)

      await waitFor(() => {
        expect(screen.getByLabelText(/job title/i)).toBeInTheDocument()
      })

      // Fill in some data
      const jobTitleInput = screen.getByLabelText(/job title/i)
      await user.type(jobTitleInput, "Test Job")

      // Click clear
      await user.click(screen.getByRole("button", { name: /clear form/i }))

      expect(jobTitleInput).toHaveValue("")
    })
  })

  describe("generation workflow", () => {
    it("should show validation error when required fields are missing", async () => {
      const user = userEvent.setup()
      renderWithRouter(<DocumentBuilderPage />)

      await waitFor(() => {
        expect(screen.getByText("Document Builder")).toBeInTheDocument()
      })

      // Try to generate without filling required fields
      await user.click(screen.getByRole("button", { name: /generate resume/i }))

      await waitFor(() => {
        expect(screen.getByText(/job title and company name are required/i)).toBeInTheDocument()
      })
    })

    it("should start generation when form is submitted with required fields", async () => {
      const user = userEvent.setup()
      renderWithRouter(<DocumentBuilderPage />)

      await waitFor(() => {
        expect(screen.getByLabelText(/job title/i)).toBeInTheDocument()
      })

      // Fill required fields
      await user.type(screen.getByLabelText(/job title/i), "Test Job")
      await user.type(screen.getByLabelText(/company name/i), "Test Company")

      // Submit form
      await user.click(screen.getByRole("button", { name: /generate resume/i }))

      await waitFor(() => {
        expect(generatorClient.startGeneration).toHaveBeenCalledWith(
          expect.objectContaining({
            generateType: "resume",
            job: expect.objectContaining({
              role: "Test Job",
              company: "Test Company",
            }),
          })
        )
      })
    })

    itWithRetry("should show success message when generation completes", async () => {
      const user = userEvent.setup()
      renderWithRouter(<DocumentBuilderPage />)

      await waitFor(() => {
        expect(screen.getByLabelText(/job title/i)).toBeInTheDocument()
      })

      // Fill required fields
      await user.type(screen.getByLabelText(/job title/i), "Test Job")
      await user.type(screen.getByLabelText(/company name/i), "Test Company")

      // Submit form
      await user.click(screen.getByRole("button", { name: /generate resume/i }))

      await waitFor(() => {
        expect(screen.getByText(/resume generated successfully/i)).toBeInTheDocument()
      })
    })

    itWithRetry("should show download button when resume is generated", async () => {
      const user = userEvent.setup()
      renderWithRouter(<DocumentBuilderPage />)

      await waitFor(() => {
        expect(screen.getByLabelText(/job title/i)).toBeInTheDocument()
      })

      // Fill required fields
      await user.type(screen.getByLabelText(/job title/i), "Test Job")
      await user.type(screen.getByLabelText(/company name/i), "Test Company")

      // Submit form
      await user.click(screen.getByRole("button", { name: /generate resume/i }))

      await waitFor(() => {
        expect(screen.getByRole("link", { name: /download resume/i })).toBeInTheDocument()
      })
    })
  })

  describe("error handling", () => {
    it("should show error when generation fails to start", async () => {
      vi.mocked(generatorClient.startGeneration).mockResolvedValue({
        success: false,
        data: { requestId: "", nextStep: null, steps: [] },
      } as any)

      const user = userEvent.setup()
      renderWithRouter(<DocumentBuilderPage />)

      await waitFor(() => {
        expect(screen.getByLabelText(/job title/i)).toBeInTheDocument()
      })

      // Fill required fields
      await user.type(screen.getByLabelText(/job title/i), "Test Job")
      await user.type(screen.getByLabelText(/company name/i), "Test Company")

      // Submit form
      await user.click(screen.getByRole("button", { name: /generate resume/i }))

      await waitFor(() => {
        expect(screen.getByText(/failed to start generation/i)).toBeInTheDocument()
      })
    })

    it("should show error when generation throws an exception", async () => {
      vi.mocked(generatorClient.startGeneration).mockRejectedValue(new Error("Network error"))

      const user = userEvent.setup()
      renderWithRouter(<DocumentBuilderPage />)

      await waitFor(() => {
        expect(screen.getByLabelText(/job title/i)).toBeInTheDocument()
      })

      // Fill required fields
      await user.type(screen.getByLabelText(/job title/i), "Test Job")
      await user.type(screen.getByLabelText(/company name/i), "Test Company")

      // Submit form
      await user.click(screen.getByRole("button", { name: /generate resume/i }))

      await waitFor(() => {
        expect(screen.getByText(/network error/i)).toBeInTheDocument()
      })
    })

    it("should handle job matches load failure gracefully", async () => {
      vi.mocked(jobMatchesClient.getMatches).mockRejectedValue(new Error("Failed to load"))

      renderWithRouter(<DocumentBuilderPage />)

      // Should still render the form
      await waitFor(() => {
        expect(screen.getByText("Document Builder")).toBeInTheDocument()
        expect(screen.getByLabelText(/job title/i)).toBeInTheDocument()
      })
    })
  })

  describe("document types", () => {
    it("should default to resume document type", async () => {
      renderWithRouter(<DocumentBuilderPage />)

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /generate resume/i })).toBeInTheDocument()
      })
    })
  })
})
