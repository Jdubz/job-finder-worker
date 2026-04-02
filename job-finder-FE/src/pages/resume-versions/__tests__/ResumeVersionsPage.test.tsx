import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ResumeVersionsPage } from "../ResumeVersionsPage"
import type { ResumeVersion, ResumeItemNode } from "@shared/types"

// ─── Mocks ───────────────────────────────────────────────────────

const mockAuth = { user: null as { id: string; email: string } | null, isOwner: false }

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockAuth
}))

const ts = new Date("2024-01-01")

const mockVersion: ResumeVersion = {
  id: "v-pool",
  slug: "pool",
  name: "Resume Pool",
  description: null,
  pdfPath: null,
  pdfSizeBytes: null,
  publishedAt: null,
  publishedBy: null,
  createdAt: ts,
  updatedAt: ts
}

const mockItems: ResumeItemNode[] = [
  {
    id: "work-1",
    resumeVersionId: "v-pool",
    parentId: null,
    orderIndex: 0,
    aiContext: "work",
    title: "Company A",
    role: "Engineer",
    location: null,
    website: null,
    startDate: "2023-01",
    endDate: null,
    description: null,
    skills: null,
    createdAt: ts,
    updatedAt: ts,
    createdBy: "admin@test.dev",
    updatedBy: "admin@test.dev"
  }
]

const mockHookState = {
  version: mockVersion as ResumeVersion | null,
  items: mockItems,
  contentFit: null,
  loading: false,
  error: null as Error | null,
  mutationCount: 0,
  createItem: vi.fn(),
  updateItem: vi.fn(),
  deleteItem: vi.fn(),
  reorderItem: vi.fn(),
  refetch: vi.fn()
}

vi.mock("@/hooks/useResumeVersion", () => ({
  useResumeVersion: () => mockHookState
}))

vi.mock("@/api", () => ({
  resumeVersionsClient: {
    getPoolHealth: vi.fn().mockResolvedValue({
      narratives: 2, experiences: 3, highlights: 10,
      skillCategories: 4, projects: 1, education: 1, totalItems: 21
    }),
    estimateResume: vi.fn().mockResolvedValue({
      contentFit: { usagePercent: 80, fits: true, pageCount: 1, mainColumnLines: 50, maxLines: 67, overflow: -17, suggestions: [] },
      selectedCount: 1
    }),
    buildCustomResume: vi.fn().mockResolvedValue({ contentFit: {}, pdfSizeBytes: 0 }),
    getCustomBuildPdfUrl: vi.fn(() => "http://localhost/pdf")
  },
  jobMatchesClient: {
    listMatches: vi.fn().mockResolvedValue([])
  }
}))

// ─── Tests ───────────────────────────────────────────────────────

describe("ResumeVersionsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.user = null
    mockAuth.isOwner = false
    mockHookState.loading = false
    mockHookState.version = mockVersion
    mockHookState.items = mockItems
    mockHookState.error = null
  })

  describe("tab layout", () => {
    it("defaults to Pool tab", async () => {
      render(<ResumeVersionsPage />)

      // Pool tab should be active — its content should be visible
      await waitFor(() => {
        expect(screen.getByText("Pool Health")).toBeInTheDocument()
      })
    })

    it("shows page heading", () => {
      render(<ResumeVersionsPage />)

      expect(screen.getByRole("heading", { name: /Resumes/i, level: 1 })).toBeInTheDocument()
    })

    it("always shows Pool tab", () => {
      render(<ResumeVersionsPage />)

      expect(screen.getByRole("tab", { name: /Pool/i })).toBeInTheDocument()
    })
  })

  describe("unauthenticated user", () => {
    it("does not show Build Resume tab", () => {
      render(<ResumeVersionsPage />)

      expect(screen.queryByRole("tab", { name: /Build Resume/i })).not.toBeInTheDocument()
    })

    it("shows pool content by default", async () => {
      render(<ResumeVersionsPage />)

      await waitFor(() => {
        expect(screen.getByText("Pool Health")).toBeInTheDocument()
      })
    })
  })

  describe("authenticated user", () => {
    beforeEach(() => {
      mockAuth.user = { id: "user-1", email: "user@example.com" }
    })

    it("shows Build Resume tab", () => {
      render(<ResumeVersionsPage />)

      expect(screen.getByRole("tab", { name: /Build Resume/i })).toBeInTheDocument()
    })

    it("shows Pool tab as default even when authenticated", async () => {
      render(<ResumeVersionsPage />)

      // Pool content should be visible by default
      await waitFor(() => {
        expect(screen.getByText("Pool Health")).toBeInTheDocument()
      })
    })

    it("shows both Pool and Build Resume tabs", () => {
      render(<ResumeVersionsPage />)

      expect(screen.getByRole("tab", { name: /Pool/i })).toBeInTheDocument()
      expect(screen.getByRole("tab", { name: /Build Resume/i })).toBeInTheDocument()
    })
  })

  describe("admin user", () => {
    beforeEach(() => {
      mockAuth.user = { id: "admin-1", email: "admin@example.com" }
      mockAuth.isOwner = true
    })

    it("shows Edit Mode button in Pool tab", async () => {
      render(<ResumeVersionsPage />)

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Edit Mode/i })).toBeInTheDocument()
      })
    })

    it("shows Test Tailoring card in Pool tab", async () => {
      render(<ResumeVersionsPage />)

      await waitFor(() => {
        expect(screen.getByText("Test Tailoring")).toBeInTheDocument()
      })
    })
  })

  describe("tab state persistence", () => {
    it("preserves active tab across loading remounts", async () => {
      mockAuth.user = { id: "user-1", email: "user@example.com" }
      const user = userEvent.setup()

      const { rerender } = render(<ResumeVersionsPage />)

      // Switch to Build tab
      await user.click(screen.getByRole("tab", { name: /Build Resume/i }))

      // Verify Build tab is active
      expect(screen.getByRole("tab", { name: /Build Resume/i })).toHaveAttribute("data-state", "active")

      // Simulate loading=true (happens during refetch after mutation)
      mockHookState.loading = true
      rerender(<ResumeVersionsPage />)

      // Simulate loading=false (refetch complete)
      mockHookState.loading = false
      rerender(<ResumeVersionsPage />)

      // Build tab should still be active
      expect(screen.getByRole("tab", { name: /Build Resume/i })).toHaveAttribute("data-state", "active")
    })

    it("falls back to Pool tab when user logs out while on Build tab", async () => {
      mockAuth.user = { id: "user-1", email: "user@example.com" }
      const user = userEvent.setup()

      const { rerender } = render(<ResumeVersionsPage />)

      // Switch to Build tab
      await user.click(screen.getByRole("tab", { name: /Build Resume/i }))
      expect(screen.getByRole("tab", { name: /Build Resume/i })).toHaveAttribute("data-state", "active")

      // User logs out
      mockAuth.user = null
      rerender(<ResumeVersionsPage />)

      // Build tab should be gone, Pool should be active
      expect(screen.queryByRole("tab", { name: /Build Resume/i })).not.toBeInTheDocument()
      const poolTab = screen.getByRole("tab", { name: /Pool/i })
      expect(poolTab).toHaveAttribute("data-state", "active")
    })
  })
})
