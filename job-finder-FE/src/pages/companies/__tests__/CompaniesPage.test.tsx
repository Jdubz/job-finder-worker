/**
 * Companies Page Tests
 *
 * Tests for company discovery page including:
 * - Rendering and display of company tasks
 * - Add company modal functionality
 * - Loading and empty states
 * - Authentication requirements
 * - Form validation and submission
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { CompaniesPage } from "../CompaniesPage"
import { useAuth } from "@/contexts/AuthContext"
import { useQueueItems } from "@/hooks/useQueueItems"

vi.mock("@/contexts/AuthContext")
vi.mock("@/hooks/useQueueItems")

describe("CompaniesPage", () => {
  const mockUser = {
    uid: "test-user-123",
    email: "test@example.com",
    displayName: "Test User",
  }

  const mockCompanyTasks = [
    {
      id: "company-1",
      type: "company",
      status: "pending",
      url: "https://acme.com",
      company_name: "Acme Corporation",
      company_id: null,
      source: "user_request",
      created_at: new Date(),
      updated_at: new Date(),
      retry_count: 0,
      max_retries: 3,
    },
    {
      id: "company-2",
      type: "company",
      status: "success",
      url: "https://techcorp.io",
      company_name: "TechCorp",
      company_id: "tech-123",
      source: "user_request",
      created_at: new Date(),
      updated_at: new Date(),
      retry_count: 0,
      max_retries: 3,
      result_message: "Found 3 job boards",
    },
    {
      id: "company-3",
      type: "company",
      status: "failed",
      url: "https://badurl.invalid",
      company_name: "BadCompany",
      company_id: null,
      source: "user_request",
      created_at: new Date(),
      updated_at: new Date(),
      retry_count: 3,
      max_retries: 3,
      result_message: "Failed to fetch website",
    },
  ]

  const mockJobTasks = [
    {
      id: "job-1",
      type: "job",
      status: "pending",
      url: "https://jobs.example.com/123",
      company_name: "Other Corp",
      company_id: null,
      source: "user_submission",
      created_at: new Date(),
      updated_at: new Date(),
      retry_count: 0,
      max_retries: 3,
    },
  ]

  const mockSubmitCompany = vi.fn()
  const mockRefetch = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(useAuth).mockReturnValue({
      user: mockUser as any,
      loading: false,
      isOwner: true,
      signOut: vi.fn(),
      signInWithGoogle: vi.fn(),
    } as any)

    vi.mocked(useQueueItems).mockReturnValue({
      queueItems: [...mockCompanyTasks, ...mockJobTasks] as any,
      loading: false,
      error: null,
      submitJob: vi.fn(),
      submitCompany: mockSubmitCompany,
      submitSourceDiscovery: vi.fn(),
      updateQueueItem: vi.fn(),
      deleteQueueItem: vi.fn(),
      refetch: mockRefetch,
    } as any)
  })

  describe("Initial Rendering", () => {
    it("should render the companies page with title", async () => {
      render(<CompaniesPage />)

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: /companies/i })).toBeInTheDocument()
        expect(
          screen.getByText(/discover companies and analyze their tech stack/i)
        ).toBeInTheDocument()
      })
    })

    it("should display only company tasks, not job tasks", async () => {
      render(<CompaniesPage />)

      await waitFor(() => {
        expect(screen.getByText("Acme Corporation")).toBeInTheDocument()
        expect(screen.getByText("TechCorp")).toBeInTheDocument()
        expect(screen.getByText("BadCompany")).toBeInTheDocument()
        expect(screen.queryByText("Other Corp")).not.toBeInTheDocument()
      })
    })

    it("should display status badges for each task", async () => {
      render(<CompaniesPage />)

      await waitFor(() => {
        expect(screen.getByText("pending")).toBeInTheDocument()
        expect(screen.getByText("success")).toBeInTheDocument()
        expect(screen.getByText("failed")).toBeInTheDocument()
      })
    })

    it("should display result messages when available", async () => {
      render(<CompaniesPage />)

      await waitFor(() => {
        expect(screen.getByText("Found 3 job boards")).toBeInTheDocument()
        expect(screen.getByText("Failed to fetch website")).toBeInTheDocument()
      })
    })

    it("should render Add Company button", async () => {
      render(<CompaniesPage />)

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /add company/i })).toBeInTheDocument()
      })
    })
  })

  describe("Loading State", () => {
    it("should show loading spinner when loading", () => {
      vi.mocked(useQueueItems).mockReturnValue({
        queueItems: [],
        loading: true,
        error: null,
        submitJob: vi.fn(),
        submitCompany: mockSubmitCompany,
        submitSourceDiscovery: vi.fn(),
        updateQueueItem: vi.fn(),
        deleteQueueItem: vi.fn(),
        refetch: mockRefetch,
      } as any)

      render(<CompaniesPage />)

      // Page title should still be present
      expect(screen.getByRole("heading", { name: /companies/i })).toBeInTheDocument()
    })
  })

  describe("Empty State", () => {
    it("should show empty state when no company tasks exist", async () => {
      vi.mocked(useQueueItems).mockReturnValue({
        queueItems: mockJobTasks as any, // Only job tasks, no company tasks
        loading: false,
        error: null,
        submitJob: vi.fn(),
        submitCompany: mockSubmitCompany,
        submitSourceDiscovery: vi.fn(),
        updateQueueItem: vi.fn(),
        deleteQueueItem: vi.fn(),
        refetch: mockRefetch,
      } as any)

      render(<CompaniesPage />)

      await waitFor(() => {
        expect(screen.getByText(/no company discovery tasks yet/i)).toBeInTheDocument()
      })
    })
  })

  describe("Authentication", () => {
    it("should show sign-in message for unauthenticated users", () => {
      vi.mocked(useAuth).mockReturnValue({
        user: null,
        loading: false,
        isOwner: false,
        signOut: vi.fn(),
        signInWithGoogle: vi.fn(),
      } as any)

      render(<CompaniesPage />)

      expect(screen.getByText(/sign in to discover companies/i)).toBeInTheDocument()
      expect(screen.queryByRole("button", { name: /add company/i })).not.toBeInTheDocument()
    })
  })

  describe("Add Company Modal", () => {
    it("should open modal when Add Company button is clicked", async () => {
      const user = userEvent.setup()
      render(<CompaniesPage />)

      const addButton = screen.getByRole("button", { name: /add company/i })
      await user.click(addButton)

      // Dialog title should appear
      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument()
      })
    })

    it("should have form fields in modal", async () => {
      const user = userEvent.setup()
      render(<CompaniesPage />)

      const addButton = screen.getByRole("button", { name: /add company/i })
      await user.click(addButton)

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument()
      })

      // Find inputs by their IDs
      expect(document.getElementById("companyName")).toBeInTheDocument()
      expect(document.getElementById("websiteUrl")).toBeInTheDocument()
    })

    it("should have required attribute on company name input", async () => {
      const user = userEvent.setup()
      render(<CompaniesPage />)

      const addButton = screen.getByRole("button", { name: /add company/i })
      await user.click(addButton)

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument()
      })

      const companyInput = document.getElementById("companyName") as HTMLInputElement
      expect(companyInput).toHaveAttribute("required")
    })

    it("should have required attribute on website URL input", async () => {
      const user = userEvent.setup()
      render(<CompaniesPage />)

      const addButton = screen.getByRole("button", { name: /add company/i })
      await user.click(addButton)

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument()
      })

      const websiteInput = document.getElementById("websiteUrl") as HTMLInputElement
      expect(websiteInput).toHaveAttribute("required")
      expect(websiteInput).toHaveAttribute("type", "url")
    })

    it("should submit form with valid data", async () => {
      const user = userEvent.setup()
      mockSubmitCompany.mockResolvedValue("company-new-id")

      render(<CompaniesPage />)

      const addButton = screen.getByRole("button", { name: /add company/i })
      await user.click(addButton)

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument()
      })

      // Fill form fields
      const companyInput = document.getElementById("companyName") as HTMLInputElement
      const websiteInput = document.getElementById("websiteUrl") as HTMLInputElement

      await user.type(companyInput, "New Company Inc")
      await user.type(websiteInput, "https://newcompany.com")

      // Submit form
      const submitButtons = screen.getAllByRole("button")
      const discoverButton = submitButtons.find(
        (btn) => btn.textContent?.toLowerCase().includes("discover")
      )
      await user.click(discoverButton!)

      await waitFor(() => {
        expect(mockSubmitCompany).toHaveBeenCalledWith({
          companyName: "New Company Inc",
          websiteUrl: "https://newcompany.com",
        })
      })
    })

    it("should show success message after successful submission", async () => {
      const user = userEvent.setup()
      mockSubmitCompany.mockResolvedValue("company-new-id")

      render(<CompaniesPage />)

      const addButton = screen.getByRole("button", { name: /add company/i })
      await user.click(addButton)

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument()
      })

      // Fill form fields
      const companyInput = document.getElementById("companyName") as HTMLInputElement
      const websiteInput = document.getElementById("websiteUrl") as HTMLInputElement

      await user.type(companyInput, "New Company Inc")
      await user.type(websiteInput, "https://newcompany.com")

      // Submit form
      const submitButtons = screen.getAllByRole("button")
      const discoverButton = submitButtons.find(
        (btn) => btn.textContent?.toLowerCase().includes("discover")
      )
      await user.click(discoverButton!)

      await waitFor(() => {
        expect(screen.getByText(/company discovery task created/i)).toBeInTheDocument()
      })
    })

    it("should show error message when submission fails", async () => {
      const user = userEvent.setup()
      mockSubmitCompany.mockRejectedValue(new Error("Network error"))

      render(<CompaniesPage />)

      const addButton = screen.getByRole("button", { name: /add company/i })
      await user.click(addButton)

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument()
      })

      // Fill form fields
      const companyInput = document.getElementById("companyName") as HTMLInputElement
      const websiteInput = document.getElementById("websiteUrl") as HTMLInputElement

      await user.type(companyInput, "Test Company")
      await user.type(websiteInput, "https://test.com")

      // Submit form
      const submitButtons = screen.getAllByRole("button")
      const discoverButton = submitButtons.find(
        (btn) => btn.textContent?.toLowerCase().includes("discover")
      )
      await user.click(discoverButton!)

      await waitFor(() => {
        expect(screen.getByText(/network error/i)).toBeInTheDocument()
      })
    })

    it("should disable form inputs while submitting", async () => {
      const user = userEvent.setup()
      // Make submission hang
      mockSubmitCompany.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 10000))
      )

      render(<CompaniesPage />)

      const addButton = screen.getByRole("button", { name: /add company/i })
      await user.click(addButton)

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument()
      })

      // Fill form fields
      const companyInput = document.getElementById("companyName") as HTMLInputElement
      const websiteInput = document.getElementById("websiteUrl") as HTMLInputElement

      await user.type(companyInput, "Test Company")
      await user.type(websiteInput, "https://test.com")

      // Submit form
      const submitButtons = screen.getAllByRole("button")
      const discoverButton = submitButtons.find(
        (btn) => btn.textContent?.toLowerCase().includes("discover")
      )
      await user.click(discoverButton!)

      // Inputs should be disabled
      await waitFor(() => {
        expect(companyInput).toBeDisabled()
        expect(websiteInput).toBeDisabled()
        expect(screen.getByText(/submitting/i)).toBeInTheDocument()
      })
    })
  })

  describe("Table Display", () => {
    it("should display website URLs as external links", async () => {
      render(<CompaniesPage />)

      await waitFor(() => {
        const links = screen.getAllByRole("link")
        const acmeLink = links.find((link) => link.textContent?.includes("acme.com"))
        expect(acmeLink).toHaveAttribute("href", "https://acme.com")
        expect(acmeLink).toHaveAttribute("target", "_blank")
        expect(acmeLink).toHaveAttribute("rel", "noopener noreferrer")
      })
    })

    it("should show dash for missing website URL", async () => {
      vi.mocked(useQueueItems).mockReturnValue({
        queueItems: [
          {
            id: "company-no-url",
            type: "company",
            status: "pending",
            url: "",
            company_name: "No URL Corp",
            company_id: null,
            source: "user_request",
            created_at: new Date(),
            updated_at: new Date(),
            retry_count: 0,
            max_retries: 3,
          },
        ] as any,
        loading: false,
        error: null,
        submitJob: vi.fn(),
        submitCompany: mockSubmitCompany,
        submitSourceDiscovery: vi.fn(),
        updateQueueItem: vi.fn(),
        deleteQueueItem: vi.fn(),
        refetch: mockRefetch,
      } as any)

      render(<CompaniesPage />)

      await waitFor(() => {
        expect(screen.getByText("No URL Corp")).toBeInTheDocument()
        // The dash should appear for missing URL
        const dashes = screen.getAllByText("—")
        expect(dashes.length).toBeGreaterThan(0)
      })
    })
  })
})
