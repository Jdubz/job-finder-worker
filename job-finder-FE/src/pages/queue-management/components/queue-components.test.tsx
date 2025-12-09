import { describe, expect, it, vi, afterEach } from "vitest"
import { render, screen } from "@/__tests__/test-utils"
import { ActiveQueueItem } from "./ActiveQueueItem"
import { QueueItemCard } from "./QueueItemCard"
import type { QueueItem } from "@shared/types"

const baseDate = new Date("2025-01-01T12:00:00Z")

const makeItem = (overrides: Partial<QueueItem> = {}): QueueItem => ({
  id: "item-1",
  type: "job",
  status: "processing",
  url: "https://www.example.com/jobs/123",
  company_name: "Example Co",
  company_id: "comp-1",
  source: "automated_scan",
  created_at: baseDate,
  updated_at: baseDate,
  ...overrides,
})

afterEach(() => {
  vi.useRealTimers()
})

describe("ActiveQueueItem", () => {
  it("shows loading state", () => {
    render(<ActiveQueueItem loading onCancel={vi.fn()} />)
    expect(screen.getByText(/Fetching live queue/i)).toBeInTheDocument()
  })

  it("shows empty state when no item", () => {
    render(<ActiveQueueItem onCancel={vi.fn()} />)
    expect(screen.getByText(/Nothing processing/i)).toBeInTheDocument()
  })

  it("renders key metadata for a processing item", () => {
    vi.useFakeTimers().setSystemTime(new Date("2025-01-02T12:00:00Z"))

    const item = makeItem({
      source_type: "greenhouse",
      pipeline_state: { job_data: { title: "Senior Engineer", company: "Example Co" }, filter_result: { passed: true } },
      processed_at: new Date("2025-01-02T11:00:00Z"),
    })

    render(<ActiveQueueItem item={item} onCancel={vi.fn()} />)

    expect(screen.getByText("Processing")).toBeInTheDocument()
    expect(screen.getByText("Analyze")).toBeInTheDocument()
    expect(screen.getByText("Greenhouse")).toBeInTheDocument()
    expect(screen.getByText("Senior Engineer")).toBeInTheDocument()
    expect(screen.getAllByText(/Example Co/).length).toBeGreaterThan(0)
    expect(screen.getByText("example.com")).toBeInTheDocument()
    expect(screen.getByText(/In flight/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument()
  })
})

describe("QueueItemCard", () => {
  it("renders derived fields and timing", () => {
    vi.useFakeTimers().setSystemTime(new Date("2025-01-03T00:00:00Z"))
    const item = makeItem({
      status: "pending",
      pipeline_state: { job_data: { title: "Frontend Lead", company: "Acme" } },
      result_message: "Waiting for worker",
    })

    render(
      <QueueItemCard item={item} selected={false} onSelect={vi.fn()} onCancel={vi.fn()} onRetry={vi.fn()} />
    )

    expect(screen.getByText("Frontend Lead")).toBeInTheDocument()
    expect(screen.queryAllByText(/Example Co/).length).toBeGreaterThan(0)
    expect(screen.getByText(/Queued/i)).toBeInTheDocument()
    expect(screen.getByText(/Updated/i)).toBeInTheDocument()
    expect(screen.getByText("Waiting for worker")).toBeInTheDocument()
  })

  it("falls back when title is missing", () => {
    const item = makeItem({ company_name: "", pipeline_state: undefined })
    render(
      <QueueItemCard item={item} selected={false} onSelect={vi.fn()} onCancel={vi.fn()} onRetry={vi.fn()} />
    )

    expect(screen.getByText("Role not yet detected")).toBeInTheDocument()
  })
})
