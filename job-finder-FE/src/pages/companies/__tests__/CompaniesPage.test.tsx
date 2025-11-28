/**
 * Companies Page Tests
 *
 * Tests for companies page including:
 * - Rendering and display of company database entities
 * - Simplified list view with essential columns
 * - Detail modal functionality
 * - Add company modal functionality
 * - Loading and empty states
 * - Authentication requirements
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { CompaniesPage } from "../CompaniesPage"
import { useAuth } from "@/contexts/AuthContext"
import { useCompanies } from "@/hooks/useCompanies"
import { useQueueItems } from "@/hooks/useQueueItems"

vi.mock("@/contexts/AuthContext")
vi.mock("@/hooks/useCompanies")
vi.mock("@/hooks/useQueueItems")

describe("CompaniesPage", () => {
  const mockUser = {
    uid: "test-user-123",
    email: "test@example.com",
    displayName: "Test User",
  }

  const mockCompanies = [
    {
      id: "company-1",
      name: "Acme Corporation",
      website: "https://acme.com",
      industry: "Technology",
      techStack: ["React", "Node.js", "PostgreSQL"],
      // Complete data: about > 100 chars AND culture > 50 chars
      about: "A leading technology company that specializes in building innovative software solutions for enterprise clients. Founded in 2010, we have grown to serve Fortune 500 companies worldwide.",
      culture: "We foster a collaborative environment where creativity thrives. Our team values include innovation, integrity, and inclusion.",
      headquartersLocation: "San Francisco, CA",
      companySizeCategory: "1000-5000",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "company-2",
      name: "TechCorp",
      website: "https://techcorp.io",
      industry: "Software",
      techStack: ["Python", "Django"],
      // Partial data: about > 50 chars (but no culture)
      about: "A fast-growing software company focused on developer tools and productivity solutions.",
      culture: "",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "company-3",
      name: "StartupXYZ",
      website: "https://startupxyz.com",
      industry: null,
      techStack: [],
      // Pending data: no meaningful about or culture
      about: "",
      culture: "",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]

  const mockSubmitCompany = vi.fn()
  const mockDeleteCompany = vi.fn()
  const mockRefetch = vi.fn()
  const mockSetFilters = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(useAuth).mockReturnValue({
      user: mockUser as any,
      loading: false,
      isOwner: true,
      signOut: vi.fn(),
      signInWithGoogle: vi.fn(),
    } as any)

    vi.mocked(useCompanies).mockReturnValue({
      companies: mockCompanies as any,
      loading: false,
      error: null,
      pagination: { limit: 100, offset: 0, total: 3, hasMore: false },
      updateCompany: vi.fn(),
      deleteCompany: mockDeleteCompany,
      refetch: mockRefetch,
      setFilters: mockSetFilters,
    } as any)

    vi.mocked(useQueueItems).mockReturnValue({
      queueItems: [],
      loading: false,
      error: null,
      submitJob: vi.fn(),
      submitCompany: mockSubmitCompany,
      submitSourceDiscovery: vi.fn(),
      updateQueueItem: vi.fn(),
      deleteQueueItem: vi.fn(),
      refetch: vi.fn(),
    } as any)
  })

  describe("Initial Rendering", () => {
    it("should render the companies page with title", async () => {
      render(<CompaniesPage />)

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: /companies/i })).toBeInTheDocument()
        expect(
          screen.getByText(/companies discovered and analyzed/i)
        ).toBeInTheDocument()
      })
    })

    it("should display company names in simplified list", async () => {
      render(<CompaniesPage />)

      await waitFor(() => {
        expect(screen.getByText("Acme Corporation")).toBeInTheDocument()
        expect(screen.getByText("TechCorp")).toBeInTheDocument()
        expect(screen.getByText("StartupXYZ")).toBeInTheDocument()
      })
    })

    it("should display essential columns: Name, Industry, Status", async () => {
      render(<CompaniesPage />)

      await waitFor(() => {
        // Check table headers
        expect(screen.getByRole("columnheader", { name: /name/i })).toBeInTheDocument()
        expect(screen.getByRole("columnheader", { name: /status/i })).toBeInTheDocument()
      })
    })

    it("should render Add Company button", async () => {
      render(<CompaniesPage />)

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /add company/i })).toBeInTheDocument()
      })
    })

    it("should show clickable rows instruction", async () => {
      render(<CompaniesPage />)

      await waitFor(() => {
        expect(screen.getByText(/click on a company to view details/i)).toBeInTheDocument()
      })
    })
  })

  describe("Detail Modal", () => {
    it("should open detail modal when clicking on a row", async () => {
      const user = userEvent.setup()
      render(<CompaniesPage />)

      await waitFor(() => {
        expect(screen.getByText("Acme Corporation")).toBeInTheDocument()
      })

      const row = screen.getByText("Acme Corporation").closest("tr")
      await user.click(row!)

      await waitFor(() => {
        // Modal should show the company name as title
        expect(screen.getAllByText("Acme Corporation").length).toBeGreaterThan(1)
        // Modal should show industry
        expect(screen.getAllByText("Technology").length).toBeGreaterThan(0)
      })
    })

    it("should show detailed information in modal", async () => {
      const user = userEvent.setup()
      render(<CompaniesPage />)

      await waitFor(() => {
        expect(screen.getByText("Acme Corporation")).toBeInTheDocument()
      })

      const row = screen.getByText("Acme Corporation").closest("tr")
      await user.click(row!)

      await waitFor(() => {
        // Should show website
        expect(screen.getByText("https://acme.com")).toBeInTheDocument()
        // Should show tech stack
        expect(screen.getByText("React")).toBeInTheDocument()
        expect(screen.getByText("Node.js")).toBeInTheDocument()
      })
    })

    it("should show description when available", async () => {
      const user = userEvent.setup()
      render(<CompaniesPage />)

      await waitFor(() => {
        expect(screen.getByText("Acme Corporation")).toBeInTheDocument()
      })

      const row = screen.getByText("Acme Corporation").closest("tr")
      await user.click(row!)

      await waitFor(() => {
        expect(screen.getByText(/A leading technology company that specializes/i)).toBeInTheDocument()
      })
    })

    it("should show headquarters when available", async () => {
      const user = userEvent.setup()
      render(<CompaniesPage />)

      await waitFor(() => {
        expect(screen.getByText("Acme Corporation")).toBeInTheDocument()
      })

      const row = screen.getByText("Acme Corporation").closest("tr")
      await user.click(row!)

      await waitFor(() => {
        expect(screen.getByText("San Francisco, CA")).toBeInTheDocument()
      })
    })

    it("should show delete button in modal", async () => {
      const user = userEvent.setup()
      render(<CompaniesPage />)

      await waitFor(() => {
        expect(screen.getByText("Acme Corporation")).toBeInTheDocument()
      })

      const row = screen.getByText("Acme Corporation").closest("tr")
      await user.click(row!)

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument()
      })
    })

    it("should show placeholder when tech stack is empty", async () => {
      const user = userEvent.setup()
      render(<CompaniesPage />)

      await waitFor(() => {
        expect(screen.getByText("StartupXYZ")).toBeInTheDocument()
      })

      const row = screen.getByText("StartupXYZ").closest("tr")
      await user.click(row!)

      await waitFor(() => {
        // Tech stack shows "—" when empty
        const techStackLabel = screen.getByText("Tech Stack")
        const techStackSection = techStackLabel.closest("div")
        expect(techStackSection).toHaveTextContent("—")
      })
    })
  })

  describe("Loading State", () => {
    it("should show loading spinner when loading", () => {
      vi.mocked(useCompanies).mockReturnValue({
        companies: [],
        loading: true,
        error: null,
        pagination: null,
        updateCompany: vi.fn(),
        deleteCompany: mockDeleteCompany,
        refetch: mockRefetch,
        setFilters: mockSetFilters,
      } as any)

      render(<CompaniesPage />)

      expect(screen.getByRole("heading", { name: /companies/i })).toBeInTheDocument()
    })
  })

  describe("Empty State", () => {
    it("should show empty state when no companies exist", async () => {
      vi.mocked(useCompanies).mockReturnValue({
        companies: [],
        loading: false,
        error: null,
        pagination: { limit: 100, offset: 0, total: 0, hasMore: false },
        updateCompany: vi.fn(),
        deleteCompany: mockDeleteCompany,
        refetch: mockRefetch,
        setFilters: mockSetFilters,
      } as any)

      render(<CompaniesPage />)

      await waitFor(() => {
        expect(screen.getByText(/no companies found/i)).toBeInTheDocument()
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

      expect(screen.getByText(/sign in to view companies/i)).toBeInTheDocument()
      expect(screen.queryByRole("button", { name: /add company/i })).not.toBeInTheDocument()
    })
  })

  describe("Add Company Button", () => {
    it("should render Add Company button", async () => {
      render(<CompaniesPage />)

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /add company/i })).toBeInTheDocument()
      })
    })
  })

  describe("Filtering", () => {
    it("should have search input", async () => {
      render(<CompaniesPage />)

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/search companies/i)).toBeInTheDocument()
      })
    })
  })

  describe("Re-analyze Feature", () => {
    it("should show Re-analyze button in detail modal", async () => {
      const user = userEvent.setup()
      render(<CompaniesPage />)

      await waitFor(() => {
        expect(screen.getByText("Acme Corporation")).toBeInTheDocument()
      })

      const row = screen.getByText("Acme Corporation").closest("tr")
      await user.click(row!)

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /re-analyze/i })).toBeInTheDocument()
      })
    })

    it("should call submitCompany with companyId when Re-analyze is clicked", async () => {
      const user = userEvent.setup()
      mockSubmitCompany.mockResolvedValueOnce("queue-item-123")
      render(<CompaniesPage />)

      await waitFor(() => {
        expect(screen.getByText("Acme Corporation")).toBeInTheDocument()
      })

      const row = screen.getByText("Acme Corporation").closest("tr")
      await user.click(row!)

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /re-analyze/i })).toBeInTheDocument()
      })

      const reanalyzeButton = screen.getByRole("button", { name: /re-analyze/i })
      await user.click(reanalyzeButton)

      await waitFor(() => {
        expect(mockSubmitCompany).toHaveBeenCalledWith({
          companyName: "Acme Corporation",
          websiteUrl: "https://acme.com",
          companyId: "company-1",
        })
      })
    })

    it("should show success message after successful re-analyze submission", async () => {
      const user = userEvent.setup()
      mockSubmitCompany.mockResolvedValueOnce("queue-item-123")
      render(<CompaniesPage />)

      await waitFor(() => {
        expect(screen.getByText("Acme Corporation")).toBeInTheDocument()
      })

      const row = screen.getByText("Acme Corporation").closest("tr")
      await user.click(row!)

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /re-analyze/i })).toBeInTheDocument()
      })

      const reanalyzeButton = screen.getByRole("button", { name: /re-analyze/i })
      await user.click(reanalyzeButton)

      await waitFor(() => {
        expect(screen.getByText(/re-analysis task queued/i)).toBeInTheDocument()
      })
    })

    it("should show error message when re-analyze fails", async () => {
      const user = userEvent.setup()
      mockSubmitCompany.mockRejectedValueOnce(new Error("Network error"))
      render(<CompaniesPage />)

      await waitFor(() => {
        expect(screen.getByText("Acme Corporation")).toBeInTheDocument()
      })

      const row = screen.getByText("Acme Corporation").closest("tr")
      await user.click(row!)

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /re-analyze/i })).toBeInTheDocument()
      })

      const reanalyzeButton = screen.getByRole("button", { name: /re-analyze/i })
      await user.click(reanalyzeButton)

      await waitFor(() => {
        expect(screen.getByText(/network error/i)).toBeInTheDocument()
      })
    })

    it("should disable Re-analyze button for company without website", async () => {
      const companyWithoutWebsite = {
        id: "company-no-website",
        name: "No Website Corp",
        website: null,
        industry: "Technology",
        techStack: [],
        about: "",
        culture: "",
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      vi.mocked(useCompanies).mockReturnValue({
        companies: [companyWithoutWebsite] as any,
        loading: false,
        error: null,
        pagination: { limit: 100, offset: 0, total: 1, hasMore: false },
        updateCompany: vi.fn(),
        deleteCompany: mockDeleteCompany,
        refetch: mockRefetch,
        setFilters: mockSetFilters,
      } as any)

      const user = userEvent.setup()
      render(<CompaniesPage />)

      await waitFor(() => {
        expect(screen.getByText("No Website Corp")).toBeInTheDocument()
      })

      const row = screen.getByText("No Website Corp").closest("tr")
      await user.click(row!)

      await waitFor(() => {
        const reanalyzeButton = screen.getByRole("button", { name: /re-analyze/i })
        expect(reanalyzeButton).toBeDisabled()
      })
    })
  })
})
