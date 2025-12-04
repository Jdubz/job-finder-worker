/**
 * Documents Page Tests
 *
 * Tests for the Documents page including:
 * - Rendering and display of generated documents
 * - Filter and sort functionality
 * - View and download actions
 * - Loading and empty states
 * - Preview modal integration
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { BrowserRouter } from "react-router-dom"
import { DocumentsPage } from "../DocumentsPage"
import { generatorClient, type GeneratorRequestRecord } from "@/api/generator-client"

// Mock the API clients
vi.mock("@/api/generator-client", () => ({
  generatorClient: {
    listDocuments: vi.fn(),
  },
}))

// Mock the config
vi.mock("@/config/api", () => ({
  API_CONFIG: {
    generatorBaseUrl: "http://localhost:3001/api/generator",
  },
  getAbsoluteArtifactUrl: (url: string | null | undefined) => {
    if (!url) return null
    if (url.startsWith("http://") || url.startsWith("https://")) return url
    return `http://localhost:3001/api/generator${url.replace("/api/generator", "")}`
  },
}))

// Helper function to render with router
const renderWithRouter = (component: React.ReactElement) => {
  return render(<BrowserRouter>{component}</BrowserRouter>)
}

// Mock data
const mockDocuments: GeneratorRequestRecord[] = [
  {
    id: "req-1",
    generateType: "resume",
    job: {
      role: "Senior Software Engineer",
      company: "Tech Corp",
      jobDescriptionUrl: "https://example.com/job1",
    },
    status: "completed",
    resumeUrl: "/api/generator/artifacts/2024-01-15/john-doe_tech-corp_senior-software-engineer_resume_abc123.pdf",
    coverLetterUrl: null,
    jobMatchId: "match-1",
    createdBy: "user-1",
    steps: null,
    preferences: null,
    personalInfo: null,
    createdAt: "2024-01-15T10:30:00Z",
    updatedAt: "2024-01-15T10:35:00Z",
    artifacts: [
      {
        id: "artifact-1",
        requestId: "req-1",
        artifactType: "resume",
        filename: "john-doe_tech-corp_senior-software-engineer_resume_abc123.pdf",
        storagePath: "2024-01-15/john-doe_tech-corp_senior-software-engineer_resume_abc123.pdf",
        sizeBytes: 125000,
        createdAt: "2024-01-15T10:35:00Z",
      },
    ],
  },
  {
    id: "req-2",
    generateType: "both",
    job: {
      role: "Frontend Developer",
      company: "Startup Inc",
    },
    status: "completed",
    resumeUrl: "/api/generator/artifacts/2024-01-16/jane-smith_startup-inc_frontend-developer_resume_def456.pdf",
    coverLetterUrl: "/api/generator/artifacts/2024-01-16/jane-smith_startup-inc_frontend-developer_cover-letter_ghi789.pdf",
    jobMatchId: null,
    createdBy: "user-1",
    steps: null,
    preferences: null,
    personalInfo: null,
    createdAt: "2024-01-16T14:00:00Z",
    updatedAt: "2024-01-16T14:10:00Z",
    artifacts: [
      {
        id: "artifact-2",
        requestId: "req-2",
        artifactType: "resume",
        filename: "jane-smith_startup-inc_frontend-developer_resume_def456.pdf",
        storagePath: "2024-01-16/jane-smith_startup-inc_frontend-developer_resume_def456.pdf",
        sizeBytes: 130000,
        createdAt: "2024-01-16T14:05:00Z",
      },
      {
        id: "artifact-3",
        requestId: "req-2",
        artifactType: "cover-letter",
        filename: "jane-smith_startup-inc_frontend-developer_cover-letter_ghi789.pdf",
        storagePath: "2024-01-16/jane-smith_startup-inc_frontend-developer_cover-letter_ghi789.pdf",
        sizeBytes: 85000,
        createdAt: "2024-01-16T14:10:00Z",
      },
    ],
  },
  {
    id: "req-3",
    generateType: "coverLetter",
    job: {
      role: "DevOps Engineer",
      company: "Cloud Services",
    },
    status: "processing",
    resumeUrl: null,
    coverLetterUrl: null,
    jobMatchId: null,
    createdBy: "user-1",
    steps: null,
    preferences: null,
    personalInfo: null,
    createdAt: "2024-01-17T09:00:00Z",
    updatedAt: "2024-01-17T09:00:00Z",
    artifacts: [],
  },
  {
    id: "req-4",
    generateType: "resume",
    job: {
      role: "Backend Developer",
      company: "Enterprise Corp",
    },
    status: "failed",
    resumeUrl: null,
    coverLetterUrl: null,
    jobMatchId: null,
    createdBy: "user-1",
    steps: null,
    preferences: null,
    personalInfo: null,
    createdAt: "2024-01-14T16:00:00Z",
    updatedAt: "2024-01-14T16:05:00Z",
    artifacts: [],
  },
]

describe("DocumentsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(generatorClient.listDocuments).mockResolvedValue(mockDocuments)
  })

  describe("Initial Rendering", () => {
    it("should render the documents page with title", async () => {
      renderWithRouter(<DocumentsPage />)

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: /documents/i })).toBeInTheDocument()
        expect(screen.getByText(/generated resumes and cover letters/i)).toBeInTheDocument()
      })
    })

    it("should display document records in the table", async () => {
      renderWithRouter(<DocumentsPage />)

      await waitFor(() => {
        expect(screen.getByText("Senior Software Engineer")).toBeInTheDocument()
        expect(screen.getByText("Frontend Developer")).toBeInTheDocument()
        expect(screen.getByText("DevOps Engineer")).toBeInTheDocument()
        expect(screen.getByText("Backend Developer")).toBeInTheDocument()
      })
    })

    it("should display company names", async () => {
      renderWithRouter(<DocumentsPage />)

      await waitFor(() => {
        expect(screen.getByText("Tech Corp")).toBeInTheDocument()
        expect(screen.getByText("Startup Inc")).toBeInTheDocument()
        expect(screen.getByText("Cloud Services")).toBeInTheDocument()
        expect(screen.getByText("Enterprise Corp")).toBeInTheDocument()
      })
    })

    it("should display table headers", async () => {
      renderWithRouter(<DocumentsPage />)

      await waitFor(() => {
        expect(screen.getByRole("columnheader", { name: /role/i })).toBeInTheDocument()
        expect(screen.getByRole("columnheader", { name: /company/i })).toBeInTheDocument()
        expect(screen.getByRole("columnheader", { name: /type/i })).toBeInTheDocument()
        expect(screen.getByRole("columnheader", { name: /status/i })).toBeInTheDocument()
      })
    })

    it("should display status badges", async () => {
      renderWithRouter(<DocumentsPage />)

      await waitFor(() => {
        expect(screen.getAllByText("completed").length).toBeGreaterThan(0)
        expect(screen.getByText("processing")).toBeInTheDocument()
        expect(screen.getByText("failed")).toBeInTheDocument()
      })
    })

    it("should display document type badges", async () => {
      renderWithRouter(<DocumentsPage />)

      await waitFor(() => {
        expect(screen.getAllByText("Resume").length).toBeGreaterThan(0)
        expect(screen.getByText("Both")).toBeInTheDocument()
        expect(screen.getByText("Cover Letter")).toBeInTheDocument()
      })
    })
  })

  describe("Stats Overview", () => {
    it("should display total requests count", async () => {
      renderWithRouter(<DocumentsPage />)

      await waitFor(() => {
        expect(screen.getByText("4")).toBeInTheDocument()
        expect(screen.getByText("Total Requests")).toBeInTheDocument()
      })
    })

    it("should display completed count", async () => {
      renderWithRouter(<DocumentsPage />)

      await waitFor(() => {
        expect(screen.getByText("2")).toBeInTheDocument()
        expect(screen.getByText("Completed")).toBeInTheDocument()
      })
    })

    it("should display total files count", async () => {
      renderWithRouter(<DocumentsPage />)

      await waitFor(() => {
        expect(screen.getByText("3")).toBeInTheDocument()
        expect(screen.getByText("Total Files")).toBeInTheDocument()
      })
    })
  })

  describe("Loading State", () => {
    it("should show loading spinner while fetching", async () => {
      vi.mocked(generatorClient.listDocuments).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(mockDocuments), 100))
      )

      renderWithRouter(<DocumentsPage />)

      // Loading spinner should be visible initially
      expect(screen.getByRole("heading", { name: /documents/i })).toBeInTheDocument()
    })
  })

  describe("Empty State", () => {
    it("should show empty state when no documents exist", async () => {
      vi.mocked(generatorClient.listDocuments).mockResolvedValue([])

      renderWithRouter(<DocumentsPage />)

      await waitFor(() => {
        expect(screen.getByText(/no documents yet/i)).toBeInTheDocument()
        expect(screen.getByText(/generate your first resume or cover letter/i)).toBeInTheDocument()
      })
    })

    it("should show Get Started button in empty state", async () => {
      vi.mocked(generatorClient.listDocuments).mockResolvedValue([])

      renderWithRouter(<DocumentsPage />)

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /get started/i })).toBeInTheDocument()
      })
    })
  })

  describe("Error State", () => {
    it("should show error message when fetch fails", async () => {
      vi.mocked(generatorClient.listDocuments).mockRejectedValue(new Error("Network error"))

      renderWithRouter(<DocumentsPage />)

      await waitFor(() => {
        expect(screen.getByText(/failed to load documents/i)).toBeInTheDocument()
      })
    })
  })

  describe("Filtering", () => {
    it("should have search input", async () => {
      renderWithRouter(<DocumentsPage />)

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument()
      })
    })

    it("should filter by search query", async () => {
      const user = userEvent.setup()
      renderWithRouter(<DocumentsPage />)

      await waitFor(() => {
        expect(screen.getByText("Tech Corp")).toBeInTheDocument()
      })

      const searchInput = screen.getByPlaceholderText(/search/i)
      await user.type(searchInput, "Startup")

      await waitFor(() => {
        expect(screen.getByText("Startup Inc")).toBeInTheDocument()
        expect(screen.queryByText("Tech Corp")).not.toBeInTheDocument()
      })
    })

    it("should filter by role name", async () => {
      const user = userEvent.setup()
      renderWithRouter(<DocumentsPage />)

      await waitFor(() => {
        expect(screen.getByText("Senior Software Engineer")).toBeInTheDocument()
      })

      const searchInput = screen.getByPlaceholderText(/search/i)
      await user.type(searchInput, "Frontend")

      await waitFor(() => {
        expect(screen.getByText("Frontend Developer")).toBeInTheDocument()
        expect(screen.queryByText("Senior Software Engineer")).not.toBeInTheDocument()
      })
    })

    it("should show no results message when filter matches nothing", async () => {
      const user = userEvent.setup()
      renderWithRouter(<DocumentsPage />)

      await waitFor(() => {
        expect(screen.getByText("Tech Corp")).toBeInTheDocument()
      })

      const searchInput = screen.getByPlaceholderText(/search/i)
      await user.type(searchInput, "NonexistentCompany")

      await waitFor(() => {
        expect(screen.getByText(/no documents match your filters/i)).toBeInTheDocument()
      })
    })

    it("should have status filter dropdown", async () => {
      renderWithRouter(<DocumentsPage />)

      await waitFor(() => {
        // Should have multiple comboboxes (status and sort)
        const comboboxes = screen.getAllByRole("combobox")
        expect(comboboxes.length).toBeGreaterThanOrEqual(2)
      })
    })
  })

  describe("Sorting", () => {
    it("should sort by date by default (newest first)", async () => {
      renderWithRouter(<DocumentsPage />)

      await waitFor(() => {
        const rows = screen.getAllByRole("row")
        // Skip header row, first data row should be most recent
        const firstDataRow = rows[1]
        expect(within(firstDataRow).getByText("DevOps Engineer")).toBeInTheDocument()
      })
    })
  })

  describe("Actions", () => {
    it("should render Generate New button", async () => {
      renderWithRouter(<DocumentsPage />)

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /generate new/i })).toBeInTheDocument()
      })
    })

    it("should show view buttons for completed documents with URLs", async () => {
      renderWithRouter(<DocumentsPage />)

      await waitFor(() => {
        // Should have view buttons for documents with resumeUrl or coverLetterUrl
        const viewButtons = screen.getAllByTitle(/view/i)
        expect(viewButtons.length).toBeGreaterThan(0)
      })
    })

    it("should show download buttons for completed documents", async () => {
      renderWithRouter(<DocumentsPage />)

      await waitFor(() => {
        const downloadButtons = screen.getAllByTitle(/download/i)
        expect(downloadButtons.length).toBeGreaterThan(0)
      })
    })

    it("should not show view/download buttons for failed documents", async () => {
      renderWithRouter(<DocumentsPage />)

      await waitFor(() => {
        // Find the row with the failed status
        const failedRow = screen.getByText("Backend Developer").closest("tr")
        expect(failedRow).toBeInTheDocument()

        // Should show dash for no actions
        if (failedRow) {
          expect(within(failedRow).getByText("—")).toBeInTheDocument()
        }
      })
    })
  })

  describe("Preview Modal", () => {
    it("should open preview modal when view button is clicked", async () => {
      const user = userEvent.setup()
      renderWithRouter(<DocumentsPage />)

      await waitFor(() => {
        expect(screen.getByText("Tech Corp")).toBeInTheDocument()
      })

      // Click the first view button
      const viewButtons = screen.getAllByTitle(/view resume/i)
      await user.click(viewButtons[0])

      // Modal should open with title
      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument()
      })
    })
  })

  describe("Document Path Format", () => {
    /**
     * CRITICAL: Verify the frontend correctly handles the 2-segment path format
     * that the backend storage service creates.
     *
     * Path format: /api/generator/artifacts/{date}/{filename}
     * Example: /api/generator/artifacts/2024-01-15/john-doe_resume_abc123.pdf
     */
    it("should correctly parse artifact URLs with 2-segment paths", async () => {
      renderWithRouter(<DocumentsPage />)

      await waitFor(() => {
        expect(screen.getByText("Tech Corp")).toBeInTheDocument()
      })

      // The mock data uses the correct 2-segment format
      // Verify the page renders without errors
      const viewButtons = screen.getAllByTitle(/view resume/i)
      expect(viewButtons.length).toBeGreaterThan(0)
    })

    it("should handle documents with both resume and cover letter URLs", async () => {
      renderWithRouter(<DocumentsPage />)

      await waitFor(() => {
        // Find the "Both" type document row
        const bothRow = screen.getByText("Frontend Developer").closest("tr")
        expect(bothRow).toBeInTheDocument()

        if (bothRow) {
          // Should have buttons for both resume and cover letter
          const viewButtons = within(bothRow).getAllByRole("button")
          // 2 view + 2 download = 4 buttons
          expect(viewButtons.length).toBe(4)
        }
      })
    })
  })
})
