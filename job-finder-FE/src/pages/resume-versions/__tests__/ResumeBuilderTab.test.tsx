import { fireEvent, render, screen, waitFor, act, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ResumeBuilderTab } from "../ResumeBuilderTab"
import type { ResumeItemNode } from "@shared/types"

// ─── Mock API client ─────────────────────────────────────────────

const mockEstimateResume = vi.fn()
const mockBuildCustomResume = vi.fn()
const mockGetCustomBuildPdfUrl = vi.fn(() => "https://api.test.com/resume-versions/pool/build/pdf")
const mockWindowOpen = vi.fn()

vi.mock("@/api", () => ({
  resumeVersionsClient: {
    estimateResume: (...args: unknown[]) => mockEstimateResume(...args),
    buildCustomResume: (...args: unknown[]) => mockBuildCustomResume(...args),
    getCustomBuildPdfUrl: () => mockGetCustomBuildPdfUrl()
  }
}))

// ─── Test fixtures ───────────────────────────────────────────────

const ts = new Date("2024-01-01")

function makeItem(overrides: Partial<ResumeItemNode> & { id: string }): ResumeItemNode {
  return {
    resumeVersionId: "v-pool",
    parentId: null,
    orderIndex: 0,
    aiContext: null,
    title: null,
    role: null,
    location: null,
    website: null,
    startDate: null,
    endDate: null,
    description: null,
    skills: null,
    createdAt: ts,
    updatedAt: ts,
    createdBy: "test@example.com",
    updatedBy: "test@example.com",
    ...overrides
  }
}

const narrative1 = makeItem({
  id: "nar-1",
  aiContext: "narrative",
  title: "Fullstack Summary",
  description: "A seasoned fullstack engineer with 10 years experience.",
  orderIndex: 0
})

const narrative2 = makeItem({
  id: "nar-2",
  aiContext: "narrative",
  title: "Backend Summary",
  description: "An experienced backend engineer specializing in distributed systems.",
  orderIndex: 1
})

const highlight1 = makeItem({
  id: "hl-1",
  parentId: "work-1",
  aiContext: "highlight",
  description: "Led migration to microservices architecture.",
  orderIndex: 0
})

const highlight2 = makeItem({
  id: "hl-2",
  parentId: "work-1",
  aiContext: "highlight",
  description: "Reduced API latency by 40%.",
  orderIndex: 1
})

const work1 = makeItem({
  id: "work-1",
  aiContext: "work",
  title: "Acme Corp",
  role: "Senior Engineer",
  location: "San Francisco",
  startDate: "2022-01",
  endDate: null,
  orderIndex: 0,
  children: [highlight1, highlight2]
})

const work2 = makeItem({
  id: "work-2",
  aiContext: "work",
  title: "BigCo",
  role: "Engineer",
  startDate: "2020-01",
  endDate: "2022-01",
  orderIndex: 1
})

const skills1 = makeItem({
  id: "skills-1",
  aiContext: "skills",
  title: "Languages",
  skills: ["TypeScript", "Python", "Go"],
  orderIndex: 0
})

const skills2 = makeItem({
  id: "skills-2",
  aiContext: "skills",
  title: "Frameworks",
  skills: ["React", "Node.js", "FastAPI"],
  orderIndex: 1
})

const projHighlight = makeItem({
  id: "proj-hl-1",
  parentId: "proj-1",
  aiContext: "highlight",
  description: "Built CLI tool downloaded 10k times.",
  orderIndex: 0
})

const project1 = makeItem({
  id: "proj-1",
  aiContext: "project",
  title: "Open Source CLI",
  description: "A command-line tool for productivity.",
  orderIndex: 0,
  children: [projHighlight]
})

const education1 = makeItem({
  id: "edu-1",
  aiContext: "education",
  title: "State University",
  role: "BS Computer Science",
  startDate: "2016-09",
  endDate: "2020-06",
  orderIndex: 0
})

// Section container wrapping work items
const sectionExp = makeItem({
  id: "sec-exp",
  aiContext: "section",
  title: "Experience",
  orderIndex: 0,
  children: [work1, work2]
})

const allItems: ResumeItemNode[] = [
  narrative1,
  narrative2,
  sectionExp,
  skills1,
  skills2,
  project1,
  education1
]

const mockFit = {
  contentFit: {
    mainColumnLines: 55,
    maxLines: 67,
    usagePercent: 82,
    pageCount: 1,
    fits: true,
    overflow: -12,
    suggestions: []
  },
  selectedCount: 5
}

const mockOverflowFit = {
  contentFit: {
    mainColumnLines: 80,
    maxLines: 67,
    usagePercent: 119,
    pageCount: 2,
    fits: false,
    overflow: 13,
    suggestions: ["Reduce experience entries from 5 to 4"]
  },
  selectedCount: 10
}

// ─── Helpers ─────────────────────────────────────────────────────

/** Find a checkbox by its nearest label or container text. */
function getCheckboxFor(text: string | RegExp): HTMLElement {
  const el = screen.getByText(text)
  // For items inside a <label>, the checkbox is a sibling
  const label = el.closest("label")
  if (label) {
    const cb = label.querySelector('[role="checkbox"]')
    if (cb) return cb as HTMLElement
  }
  // For items not in a <label> (e.g. work items), walk up to the border container
  let container = el.parentElement
  while (container) {
    const cb = container.querySelector('[role="checkbox"]')
    if (cb) return cb as HTMLElement
    container = container.parentElement
  }
  throw new Error(`No checkbox found near text "${String(text)}"`)
}

/** Get a scoped `within()` for a category section by its heading title. */
function withinSection(title: string) {
  const heading = screen.getByText(title)
  // Walk up to the Card root (the outermost section container)
  let el: HTMLElement | null = heading
  while (el && !el.getAttribute("class")?.includes("rounded")) {
    el = el.parentElement
  }
  // Fallback: use the grandparent of the heading
  const sectionRoot = el ?? heading.parentElement!.parentElement!
  return within(sectionRoot)
}

// ─── Tests ───────────────────────────────────────────────────────

describe("ResumeBuilderTab", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockEstimateResume.mockResolvedValue(mockFit)
    mockBuildCustomResume.mockResolvedValue({
      contentFit: mockFit.contentFit,
      pdfSizeBytes: 12345
    })
    Object.defineProperty(window, "open", { value: mockWindowOpen, writable: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ── Rendering ─────────────────────────────────────────────

  describe("rendering", () => {
    it("renders all category sections from pool items", () => {
      render(<ResumeBuilderTab items={allItems} />)

      expect(screen.getByText("Summary")).toBeInTheDocument()
      expect(screen.getByText("Experience")).toBeInTheDocument()
      expect(screen.getByText("Skills")).toBeInTheDocument()
      expect(screen.getByText("Projects")).toBeInTheDocument()
      expect(screen.getByText("Education")).toBeInTheDocument()
    })

    it("unwraps section containers and shows their children", () => {
      render(<ResumeBuilderTab items={allItems} />)

      // Work items inside the section container should be visible
      expect(screen.getByText("Acme Corp")).toBeInTheDocument()
      expect(screen.getByText("BigCo")).toBeInTheDocument()
    })

    it("shows initial empty state with prompt to select", () => {
      render(<ResumeBuilderTab items={allItems} />)

      expect(screen.getByText("Select items to see page fit estimate")).toBeInTheDocument()
    })

    it("shows selection counts as 0/N initially for each category", () => {
      render(<ResumeBuilderTab items={allItems} />)

      expect(withinSection("Experience").getByText("0/2 selected")).toBeInTheDocument()
      expect(withinSection("Skills").getByText("0/2 selected")).toBeInTheDocument()
      expect(withinSection("Projects").getByText("0/1 selected")).toBeInTheDocument()
      expect(withinSection("Education").getByText("0/1 selected")).toBeInTheDocument()
    })

    it("displays work item metadata (role, dates, location)", () => {
      render(<ResumeBuilderTab items={allItems} />)

      expect(screen.getByText(/Senior Engineer/)).toBeInTheDocument()
      // "2022-01" appears in both items — just verify Acme Corp's date span exists
      expect(screen.getByText(/2022-01 – present/)).toBeInTheDocument()
      expect(screen.getByText("San Francisco")).toBeInTheDocument()
    })

    it("displays skill items with their skill tags", () => {
      render(<ResumeBuilderTab items={allItems} />)

      expect(screen.getByText("TypeScript, Python, Go")).toBeInTheDocument()
      expect(screen.getByText("React, Node.js, FastAPI")).toBeInTheDocument()
    })

    it("displays education item with role and dates", () => {
      render(<ResumeBuilderTab items={allItems} />)

      expect(screen.getByText("State University")).toBeInTheDocument()
      expect(screen.getByText("BS Computer Science")).toBeInTheDocument()
    })

    it("displays narratives with title and description", () => {
      render(<ResumeBuilderTab items={allItems} />)

      expect(screen.getByText("Fullstack Summary")).toBeInTheDocument()
      expect(screen.getByText(/seasoned fullstack engineer/)).toBeInTheDocument()
    })

    it("renders Generate PDF button disabled when nothing selected", () => {
      render(<ResumeBuilderTab items={allItems} />)

      const btn = screen.getByRole("button", { name: /Generate PDF/i })
      expect(btn).toBeDisabled()
    })

    it("hides category sections when no items of that type exist", () => {
      const itemsWithoutProjects = [narrative1, sectionExp, skills1, education1]
      render(<ResumeBuilderTab items={itemsWithoutProjects} />)

      expect(screen.queryByText("Projects")).not.toBeInTheDocument()
    })

    it("renders job title input", () => {
      render(<ResumeBuilderTab items={allItems} />)

      expect(screen.getByPlaceholderText(/Senior Software Engineer/)).toBeInTheDocument()
    })
  })

  // ── Narrative selection (radio) ───────────────────────────

  describe("narrative selection", () => {
    it("selects a narrative via radio button", async () => {
      render(<ResumeBuilderTab items={allItems} />)

      const fullstack = screen.getByLabelText(/Fullstack Summary/i)
      const backend = screen.getByLabelText(/Backend Summary/i)
      await act(async () => { fireEvent.click(fullstack) })

      expect(fullstack).toBeChecked()
      expect(backend).not.toBeChecked()
    })

    it("switches between narratives (single selection)", async () => {
      render(<ResumeBuilderTab items={allItems} />)

      const fullstack = screen.getByLabelText(/Fullstack Summary/i)
      const backend = screen.getByLabelText(/Backend Summary/i)

      await act(async () => { fireEvent.click(fullstack) })
      expect(fullstack).toBeChecked()

      await act(async () => { fireEvent.click(backend) })
      expect(fullstack).not.toBeChecked()
      expect(backend).toBeChecked()
    })

    it("deselects a narrative when clicking it again", async () => {
      render(<ResumeBuilderTab items={allItems} />)

      const fullstack = screen.getByLabelText(/Fullstack Summary/i)
      await act(async () => { fireEvent.click(fullstack) })
      expect(fullstack).toBeChecked()

      await act(async () => { fireEvent.click(fullstack) })
      expect(fullstack).not.toBeChecked()
    })

    it("updates summary selection count", async () => {
      render(<ResumeBuilderTab items={allItems} />)

      const section = withinSection("Summary")
      expect(section.getByText("0/2 selected")).toBeInTheDocument()

      const fullstack = screen.getByLabelText(/Fullstack Summary/i)
      await act(async () => { fireEvent.click(fullstack) })

      expect(section.getByText("1/2 selected")).toBeInTheDocument()
    })
  })

  // ── Work item selection ───────────────────────────────────

  describe("work item selection", () => {
    it("selects a work item and reveals its highlights", async () => {
      render(<ResumeBuilderTab items={allItems} />)

      expect(screen.queryByText(/Led migration/)).not.toBeInTheDocument()

      await act(async () => { fireEvent.click(getCheckboxFor("Acme Corp")) })

      expect(screen.getByText(/Led migration/)).toBeInTheDocument()
      expect(screen.getByText(/Reduced API latency/)).toBeInTheDocument()
    })

    it("auto-selects all highlights when selecting a work item", async () => {
      render(<ResumeBuilderTab items={allItems} />)

      await act(async () => { fireEvent.click(getCheckboxFor("Acme Corp")) })

      expect(screen.getByText("2/2 highlights")).toBeInTheDocument()
    })

    it("allows deselecting individual highlights", async () => {
      render(<ResumeBuilderTab items={allItems} />)

      await act(async () => { fireEvent.click(getCheckboxFor("Acme Corp")) })

      // Find the highlight checkbox by its description text
      const hlCheckbox = getCheckboxFor(/Led migration/)
      await act(async () => { fireEvent.click(hlCheckbox) })

      expect(screen.getByText("1/2 highlights")).toBeInTheDocument()
    })

    it("deselecting a work item removes all its highlights", async () => {
      render(<ResumeBuilderTab items={allItems} />)

      const acmeCb = getCheckboxFor("Acme Corp")
      await act(async () => { fireEvent.click(acmeCb) })
      expect(screen.getByText(/Led migration/)).toBeInTheDocument()

      await act(async () => { fireEvent.click(acmeCb) })
      expect(screen.queryByText(/Led migration/)).not.toBeInTheDocument()
    })

    it("updates experience selection count", async () => {
      render(<ResumeBuilderTab items={allItems} />)

      await act(async () => { fireEvent.click(getCheckboxFor("Acme Corp")) })

      expect(withinSection("Experience").getByText("1/2 selected")).toBeInTheDocument()
    })
  })

  // ── Leaf item selection (skills, education) ───────────────

  describe("leaf item selection", () => {
    it("toggles a skill group on and off", async () => {
      render(<ResumeBuilderTab items={allItems} />)

      const checkbox = getCheckboxFor("Languages")

      await act(async () => { fireEvent.click(checkbox) })
      expect(checkbox).toHaveAttribute("data-state", "checked")

      await act(async () => { fireEvent.click(checkbox) })
      expect(checkbox).toHaveAttribute("data-state", "unchecked")
    })

    it("toggles an education item", async () => {
      render(<ResumeBuilderTab items={allItems} />)

      const checkbox = getCheckboxFor("State University")

      await act(async () => { fireEvent.click(checkbox) })
      expect(checkbox).toHaveAttribute("data-state", "checked")
    })
  })

  // ── Project selection (with highlights) ───────────────────

  describe("project selection", () => {
    it("selects a project and shows its highlights", async () => {
      render(<ResumeBuilderTab items={allItems} />)

      expect(screen.queryByText(/Built CLI tool/)).not.toBeInTheDocument()

      await act(async () => { fireEvent.click(getCheckboxFor("Open Source CLI")) })

      expect(screen.getByText(/Built CLI tool/)).toBeInTheDocument()
      expect(screen.getByText("1/1 highlights")).toBeInTheDocument()
    })
  })

  // ── Debounced estimation ──────────────────────────────────

  describe("estimation", () => {
    it("calls estimateResume after debounce when items are selected", async () => {
      render(<ResumeBuilderTab items={allItems} />)

      // Select a skill
      await act(async () => { fireEvent.click(getCheckboxFor("Languages")) })

      // Advance past debounce
      await act(async () => { vi.advanceTimersByTime(350) })

      expect(mockEstimateResume).toHaveBeenCalledWith(
        expect.arrayContaining(["skills-1"]),
        undefined
      )
    })

    it("includes job title in estimation when provided", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<ResumeBuilderTab items={allItems} />)

      // Type a job title
      const titleInput = screen.getByPlaceholderText(/Senior Software Engineer/)
      await user.type(titleInput, "Staff Engineer")

      // Select an item
      await act(async () => { fireEvent.click(getCheckboxFor("State University")) })

      await act(async () => { vi.advanceTimersByTime(350) })

      expect(mockEstimateResume).toHaveBeenCalledWith(
        expect.arrayContaining(["edu-1"]),
        "Staff Engineer"
      )
    })

    it("displays content fit bar after estimation completes", async () => {
      render(<ResumeBuilderTab items={allItems} />)

      await act(async () => { fireEvent.click(getCheckboxFor("Languages")) })
      await act(async () => { vi.advanceTimersByTime(350) })

      await waitFor(() => {
        expect(screen.getByText("82% of 1 page")).toBeInTheDocument()
      })
    })

    it("displays overflow warning when content exceeds one page", async () => {
      mockEstimateResume.mockResolvedValue(mockOverflowFit)

      render(<ResumeBuilderTab items={allItems} />)

      await act(async () => { fireEvent.click(getCheckboxFor("Languages")) })
      await act(async () => { vi.advanceTimersByTime(350) })

      await waitFor(() => {
        expect(screen.getByText(/119%/)).toBeInTheDocument()
        expect(screen.getByText(/overflows to 2 pages/)).toBeInTheDocument()
        expect(screen.getByText(/Reduce experience entries/)).toBeInTheDocument()
      })
    })

    it("clears estimation when all items are deselected", async () => {
      render(<ResumeBuilderTab items={allItems} />)

      const checkbox = getCheckboxFor("Languages")

      // Select
      await act(async () => { fireEvent.click(checkbox) })
      await act(async () => { vi.advanceTimersByTime(350) })
      await waitFor(() => {
        expect(screen.getByText("82% of 1 page")).toBeInTheDocument()
      })

      // Deselect
      await act(async () => { fireEvent.click(checkbox) })
      await act(async () => { vi.advanceTimersByTime(350) })

      // Should NOT call estimate with empty array, and should show prompt
      await waitFor(() => {
        expect(screen.getByText("Select items to see page fit estimate")).toBeInTheDocument()
      })
    })

    it("does not apply stale estimation responses", async () => {
      // First call takes a long time, second call resolves immediately
      let resolveFirst: (v: unknown) => void
      const firstPromise = new Promise((resolve) => { resolveFirst = resolve })

      mockEstimateResume
        .mockReturnValueOnce(firstPromise)
        .mockResolvedValueOnce({
          contentFit: { ...mockFit.contentFit, usagePercent: 50 },
          selectedCount: 1
        })

      render(<ResumeBuilderTab items={allItems} />)

      // First selection triggers first debounce
      await act(async () => { fireEvent.click(getCheckboxFor("Languages")) })
      await act(async () => { vi.advanceTimersByTime(350) })

      // Second selection triggers second debounce (first still pending)
      await act(async () => { fireEvent.click(getCheckboxFor("Frameworks")) })
      await act(async () => { vi.advanceTimersByTime(350) })

      // Now resolve the first (stale) response
      await act(async () => { resolveFirst!(mockFit) })

      // Should show the second (fresh) response, not the first
      await waitFor(() => {
        expect(screen.getByText("50% of 1 page")).toBeInTheDocument()
      })
    })
  })

  // ── Estimation error handling ─────────────────────────────

  describe("estimation errors", () => {
    it("clears content fit when estimation fails", async () => {
      render(<ResumeBuilderTab items={allItems} />)

      // First: successful estimation
      await act(async () => { fireEvent.click(getCheckboxFor("Languages")) })
      await act(async () => { vi.advanceTimersByTime(350) })
      await waitFor(() => {
        expect(screen.getByText("82% of 1 page")).toBeInTheDocument()
      })

      // Now make estimation fail
      mockEstimateResume.mockRejectedValue(new Error("Auth failed"))

      // Select another item to trigger a new estimation
      await act(async () => { fireEvent.click(getCheckboxFor("Frameworks")) })
      await act(async () => { vi.advanceTimersByTime(350) })

      // Content fit bar should be gone — replaced by the empty-state prompt
      await waitFor(() => {
        expect(screen.queryByText("82% of 1 page")).not.toBeInTheDocument()
      })
    })

    it("recovers after a failed estimation when next one succeeds", async () => {
      render(<ResumeBuilderTab items={allItems} />)

      // First call fails
      mockEstimateResume.mockRejectedValueOnce(new Error("Network error"))

      await act(async () => { fireEvent.click(getCheckboxFor("Languages")) })
      await act(async () => { vi.advanceTimersByTime(350) })

      // Let the rejection settle
      await act(async () => { await Promise.resolve() })

      // Next call succeeds (default mock is back)
      mockEstimateResume.mockResolvedValue(mockFit)
      await act(async () => { fireEvent.click(getCheckboxFor("Frameworks")) })
      await act(async () => { vi.advanceTimersByTime(350) })

      await waitFor(() => {
        expect(screen.getByText("82% of 1 page")).toBeInTheDocument()
      })
    })
  })

  // ── Generate PDF ──────────────────────────────────────────

  describe("PDF generation", () => {
    it("enables Generate button when items are selected", async () => {
      render(<ResumeBuilderTab items={allItems} />)

      const btn = screen.getByRole("button", { name: /Generate PDF/i })
      expect(btn).toBeDisabled()

      await act(async () => { fireEvent.click(getCheckboxFor("Languages")) })

      expect(btn).toBeEnabled()
    })

    it("calls buildCustomResume with selected IDs on generate", async () => {
      render(<ResumeBuilderTab items={allItems} />)

      // Select narrative + skill
      await act(async () => { fireEvent.click(screen.getByLabelText(/Fullstack Summary/i)) })

      await act(async () => { fireEvent.click(getCheckboxFor("Languages")) })

      const btn = screen.getByRole("button", { name: /Generate PDF/i })
      await act(async () => { fireEvent.click(btn) })

      expect(mockBuildCustomResume).toHaveBeenCalledWith(
        expect.arrayContaining(["skills-1", "nar-1"]),
        undefined
      )
    })

    it("shows Download PDF button after successful build", async () => {
      render(<ResumeBuilderTab items={allItems} />)

      await act(async () => { fireEvent.click(getCheckboxFor("Languages")) })

      const btn = screen.getByRole("button", { name: /Generate PDF/i })
      await act(async () => { fireEvent.click(btn) })

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Download PDF/i })).toBeInTheDocument()
      })
    })

    it("opens PDF URL in new window on download click", async () => {
      render(<ResumeBuilderTab items={allItems} />)

      await act(async () => { fireEvent.click(getCheckboxFor("Languages")) })

      const generateBtn = screen.getByRole("button", { name: /Generate PDF/i })
      await act(async () => { fireEvent.click(generateBtn) })

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Download PDF/i })).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole("button", { name: /Download PDF/i }))
      expect(mockWindowOpen).toHaveBeenCalledWith(
        "https://api.test.com/resume-versions/pool/build/pdf",
        "_blank",
        "noopener,noreferrer"
      )
    })

    it("shows error message when build fails", async () => {
      mockBuildCustomResume.mockRejectedValue(new Error("Build timed out"))

      render(<ResumeBuilderTab items={allItems} />)

      await act(async () => { fireEvent.click(getCheckboxFor("Languages")) })

      const btn = screen.getByRole("button", { name: /Generate PDF/i })
      await act(async () => { fireEvent.click(btn) })

      await waitFor(() => {
        expect(screen.getByText("Build timed out")).toBeInTheDocument()
      })
    })

    it("invalidates previous build when selection changes", async () => {
      render(<ResumeBuilderTab items={allItems} />)

      // Select and build
      await act(async () => { fireEvent.click(getCheckboxFor("Languages")) })
      const btn = screen.getByRole("button", { name: /Generate PDF/i })
      await act(async () => { fireEvent.click(btn) })

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Download PDF/i })).toBeInTheDocument()
      })

      // Change selection — Download should disappear
      await act(async () => { fireEvent.click(getCheckboxFor("State University")) })

      expect(screen.queryByRole("button", { name: /Download PDF/i })).not.toBeInTheDocument()
    })

    it("passes job title to build when provided", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<ResumeBuilderTab items={allItems} />)

      const titleInput = screen.getByPlaceholderText(/Senior Software Engineer/)
      await user.type(titleInput, "Staff Engineer")

      await act(async () => { fireEvent.click(getCheckboxFor("Languages")) })

      const btn = screen.getByRole("button", { name: /Generate PDF/i })
      await act(async () => { fireEvent.click(btn) })

      expect(mockBuildCustomResume).toHaveBeenCalledWith(
        expect.arrayContaining(["skills-1"]),
        "Staff Engineer"
      )
    })
  })

  // ── Composite selection IDs ───────────────────────────────

  describe("selection ID composition", () => {
    it("includes narrative, work item, highlights, and leaf items in estimate call", async () => {
      render(<ResumeBuilderTab items={allItems} />)

      // Select narrative
      await act(async () => { fireEvent.click(screen.getByLabelText(/Fullstack Summary/i)) })

      // Select Acme Corp (with highlights)
      await act(async () => { fireEvent.click(getCheckboxFor("Acme Corp")) })

      // Select a skill
      await act(async () => { fireEvent.click(getCheckboxFor("Languages")) })

      await act(async () => { vi.advanceTimersByTime(350) })

      const calledIds = mockEstimateResume.mock.calls.at(-1)?.[0] as string[]
      expect(calledIds).toContain("nar-1")     // narrative
      expect(calledIds).toContain("work-1")    // work parent
      expect(calledIds).toContain("hl-1")      // highlight 1
      expect(calledIds).toContain("hl-2")      // highlight 2
      expect(calledIds).toContain("skills-1")  // skill leaf
    })
  })
})
