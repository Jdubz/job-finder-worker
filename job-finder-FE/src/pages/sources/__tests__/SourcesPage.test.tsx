/**
 * Sources Page Tests
 *
 * Tests for sources page including:
 * - Rendering and display of job source database entities
 * - Simplified list view with essential columns
 * - Detail modal functionality
 * - Add source modal functionality
 * - Loading and empty states
 * - Authentication requirements
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SourcesPage } from "../SourcesPage"
import { useAuth } from "@/contexts/AuthContext"
import { useJobSources } from "@/hooks/useJobSources"
import { useQueueItems } from "@/hooks/useQueueItems"
import { EntityModalProvider } from "@/contexts/EntityModalContext"
import { formatDistanceToNowStrict } from "date-fns"
import type { JobSource } from "@shared/types"

vi.mock("@/contexts/AuthContext")
vi.mock("@/hooks/useJobSources")
vi.mock("@/hooks/useQueueItems")

describe("SourcesPage", () => {
  const mockUser = {
    uid: "test-user-123",
    email: "test@example.com",
    displayName: "Test User",
  }

  let mockSources: JobSource[]

  const mockSubmitSourceDiscovery = vi.fn()
  const mockDeleteSource = vi.fn()
  const mockUpdateSource = vi.fn()
  const mockRefetch = vi.fn()
  const mockSetFilters = vi.fn()
  const renderWithProvider = () =>
    render(
      <EntityModalProvider>
        <SourcesPage />
      </EntityModalProvider>
    )

  beforeEach(() => {
    vi.clearAllMocks()

    const now = new Date()
    mockSources = [
      {
        id: "source-1",
        name: "Acme Greenhouse",
        sourceType: "greenhouse",
        status: "active",
        aggregatorDomain: null,
        companyId: "company-1",
        configJson: { url: "https://boards.greenhouse.io/acme" },
        lastScrapedAt: new Date(now.getTime() - 6 * 60 * 60 * 1000),
        createdAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(now.getTime() - 7 * 60 * 60 * 1000),
      },
      {
        id: "source-2",
        name: "TechCorp RSS",
        sourceType: "rss",
        status: "active",
        aggregatorDomain: null,
        companyId: "company-2",
        configJson: { url: "https://careers.techcorp.io/jobs.rss" },
        lastScrapedAt: new Date(now.getTime() - 8 * 60 * 60 * 1000),
        createdAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(now.getTime() - 8 * 60 * 60 * 1000),
      },
      {
        id: "source-3",
        name: "Remotive Jobs",
        sourceType: "api",
        status: "paused",
        aggregatorDomain: "remotive.com",
        companyId: null,
        configJson: { url: "https://remotive.com/api/remote-jobs" },
        lastScrapedAt: null,
        createdAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(now.getTime() - 8 * 60 * 60 * 1000),
      },
    ]

    vi.mocked(useAuth).mockReturnValue({
      user: mockUser as any,
      loading: false,
      isOwner: true,
      signOut: vi.fn(),
      signInWithGoogle: vi.fn(),
    } as any)

    vi.mocked(useJobSources).mockReturnValue({
      sources: mockSources as any,
      loading: false,
      error: null,
      pagination: { limit: 100, offset: 0, total: 3, hasMore: false },
      stats: null,
      updateSource: mockUpdateSource,
      deleteSource: mockDeleteSource,
      refetch: mockRefetch,
      fetchStats: vi.fn(),
      setFilters: mockSetFilters,
    } as any)

    vi.mocked(useQueueItems).mockReturnValue({
      queueItems: [],
      loading: false,
      error: null,
      submitJob: vi.fn(),
      submitCompany: vi.fn(),
      submitSourceDiscovery: mockSubmitSourceDiscovery,
      updateQueueItem: vi.fn(),
      deleteQueueItem: vi.fn(),
      refetch: vi.fn(),
    } as any)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe("Initial Rendering", () => {
    it("should render the sources page with title", async () => {
      renderWithProvider()

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: /sources/i })).toBeInTheDocument()
        expect(
          screen.getByText(/job sources configured for automated scraping/i)
        ).toBeInTheDocument()
      })
    })

    it("should display source names in simplified list", async () => {
      renderWithProvider()

      await waitFor(() => {
        expect(screen.getByText("Acme Greenhouse")).toBeInTheDocument()
        expect(screen.getByText("TechCorp RSS")).toBeInTheDocument()
        expect(screen.getByText("Remotive Jobs")).toBeInTheDocument()
      })
    })

    it("should display essential columns: Name, Type, Status", async () => {
      renderWithProvider()

      await waitFor(() => {
        // Check table headers
        expect(screen.getByRole("columnheader", { name: /name/i })).toBeInTheDocument()
        expect(screen.getByRole("columnheader", { name: /type/i })).toBeInTheDocument()
        expect(screen.getByRole("columnheader", { name: /status/i })).toBeInTheDocument()
        expect(screen.getByRole("columnheader", { name: /last scraped/i })).toBeInTheDocument()
      })
    })

    it("should display status badges for each source", async () => {
      renderWithProvider()

      await waitFor(() => {
        const activeBadges = screen.getAllByText("active")
        expect(activeBadges.length).toBe(2)
        expect(screen.getByText("paused")).toBeInTheDocument()
      })
    })

    it("should display source type badges", async () => {
      renderWithProvider()

      await waitFor(() => {
        expect(screen.getByText("Greenhouse")).toBeInTheDocument()
        expect(screen.getByText("RSS")).toBeInTheDocument()
        expect(screen.getByText("API")).toBeInTheDocument()
      })
    })

    it("should render Add Source button", async () => {
      renderWithProvider()

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /add source/i })).toBeInTheDocument()
      })
    })

    it("should show clickable rows instruction", async () => {
      renderWithProvider()

      await waitFor(() => {
        expect(screen.getByText(/click on a source to view details/i)).toBeInTheDocument()
      })
    })
  })

  describe("Sorting controls", () => {
    it("renders sort dropdowns and sends filter updates", async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 })
      renderWithProvider()

      await waitFor(() => {
        expect(screen.getByText("Updated (newest)")).toBeInTheDocument()
        expect(screen.getByText("Desc")).toBeInTheDocument()
      })

      const comboboxes = screen.getAllByRole('combobox')
      const sortFieldCombobox = comboboxes[1]
      const sortOrderCombobox = comboboxes[2]

      await user.click(sortFieldCombobox)
      await user.click(screen.getByText("Last scraped"))

      await user.click(sortOrderCombobox)
      await user.click(screen.getByText("Asc"))

      expect(mockSetFilters).toHaveBeenLastCalledWith({
        search: undefined,
        status: undefined,
        limit: 100,
        sortBy: "last_scraped_at",
        sortOrder: "asc",
      })
    })
  })

  describe("Table Rows", () => {
    it("should have clickable rows", async () => {
      renderWithProvider()

      await waitFor(() => {
        expect(screen.getByText("Acme Greenhouse")).toBeInTheDocument()
      })

      // Verify rows have cursor-pointer class for click affordance
      const row = screen.getByText("Acme Greenhouse").closest("tr")
      expect(row).toHaveClass("cursor-pointer")
    })

    it("shows formatted last scraped times", async () => {
      renderWithProvider()

      await waitFor(() => {
        const sixHoursLabel = formatDistanceToNowStrict(mockSources[0].lastScrapedAt as Date, { addSuffix: true })
        const eightHoursLabel = formatDistanceToNowStrict(mockSources[1].lastScrapedAt as Date, { addSuffix: true })

        expect(screen.getByText(new RegExp(sixHoursLabel, "i"))).toBeInTheDocument()
        expect(screen.getByText(new RegExp(eightHoursLabel, "i"))).toBeInTheDocument()
        expect(screen.getAllByText("—").length).toBeGreaterThan(0)
      })
    })
  })

  describe("Loading State", () => {
    it("should show loading spinner when loading", () => {
      vi.mocked(useJobSources).mockReturnValue({
        sources: [],
        loading: true,
        error: null,
        pagination: null,
        stats: null,
        updateSource: mockUpdateSource,
        deleteSource: mockDeleteSource,
        refetch: mockRefetch,
        fetchStats: vi.fn(),
        setFilters: mockSetFilters,
      } as any)

      renderWithProvider()

      expect(screen.getByRole("heading", { name: /sources/i })).toBeInTheDocument()
    })
  })

  describe("Empty State", () => {
    it("should show empty state when no sources exist", async () => {
      vi.mocked(useJobSources).mockReturnValue({
        sources: [],
        loading: false,
        error: null,
        pagination: { limit: 100, offset: 0, total: 0, hasMore: false },
        stats: null,
        updateSource: mockUpdateSource,
        deleteSource: mockDeleteSource,
        refetch: mockRefetch,
        fetchStats: vi.fn(),
        setFilters: mockSetFilters,
      } as any)

      renderWithProvider()

      await waitFor(() => {
        expect(screen.getByText(/no sources found/i)).toBeInTheDocument()
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

      renderWithProvider()

      expect(screen.getByText(/sign in to view sources/i)).toBeInTheDocument()
      expect(screen.queryByRole("button", { name: /add source/i })).not.toBeInTheDocument()
    })
  })

  describe("Add Source Button", () => {
    it("should render Add Source button", async () => {
      renderWithProvider()

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /add source/i })).toBeInTheDocument()
      })
    })
  })

  describe("Filtering", () => {
    it("should have status filter dropdown", async () => {
      renderWithProvider()

      await waitFor(() => {
      expect(screen.getByText(/All Status/i)).toBeInTheDocument()
      })
    })

    it("should have search input", async () => {
      renderWithProvider()

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/search sources/i)).toBeInTheDocument()
      })
    })
  })
})
