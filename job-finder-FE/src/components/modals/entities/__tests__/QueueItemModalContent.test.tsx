import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueueItemModalContent } from "../QueueItemModalContent"
import type { QueueItem } from "@shared/types"

const mockOpenModal = vi.fn()
const mockToast = vi.fn()

vi.mock("@/contexts/EntityModalContext", () => ({
  useEntityModal: () => ({ openModal: mockOpenModal, closeModal: vi.fn(), modal: null })
}))

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: mockToast, dismiss: vi.fn(), clear: vi.fn() })
}))

const mockListing = { id: "listing-1", title: "Test Listing", companyId: "comp-1", companyName: "Acme" }
const mockMatch = { id: "match-1", jobListingId: "listing-1" }
const mockCompany = { id: "comp-1", name: "Acme" }
const mockSource = { id: "source-1", name: "Source" }

vi.mock("@/api", () => ({
  jobListingsClient: { getListing: vi.fn(async () => mockListing) },
  jobMatchesClient: { listMatches: vi.fn(async () => [mockMatch]) },
  companiesClient: { getCompany: vi.fn(async () => mockCompany) },
  jobSourcesClient: { getJobSource: vi.fn(async () => mockSource) }
}))

function makeItem(overrides: Partial<QueueItem> = {}): QueueItem {
  return {
    id: "queue-1",
    type: "job",
    status: "failed",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    metadata: { job_listing_id: "listing-1", company_id: "comp-1", source_id: "source-1" },
    ...overrides
  } as QueueItem
}

describe("QueueItemModalContent related links", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders related record buttons when IDs are present", () => {
    render(<QueueItemModalContent item={makeItem()} />)

    expect(screen.getByText(/Listing: listing-1/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /open listing modal/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /view job match/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /open company modal/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /open source modal/i })).toBeInTheDocument()
  })

  it("opens job listing modal after fetching listing", async () => {
    const user = userEvent.setup()
    render(<QueueItemModalContent item={makeItem()} />)

    await user.click(screen.getByRole("button", { name: /open listing modal/i }))

    const { jobListingsClient } = await import("@/api")
    expect(jobListingsClient.getListing).toHaveBeenCalledWith("listing-1")
    expect(mockOpenModal).toHaveBeenCalledWith({ type: "jobListing", listing: mockListing })
  })

  it("opens job match modal after fetching match", async () => {
    const user = userEvent.setup()
    render(<QueueItemModalContent item={makeItem()} />)

    await user.click(screen.getByRole("button", { name: /view job match/i }))

    const { jobMatchesClient } = await import("@/api")
    expect(jobMatchesClient.listMatches).toHaveBeenCalledWith({ jobListingId: "listing-1", limit: 1 })
    expect(mockOpenModal).toHaveBeenCalledWith({ type: "jobMatch", match: mockMatch })
  })

  it("opens company modal after fetching company", async () => {
    const user = userEvent.setup()
    render(<QueueItemModalContent item={makeItem()} />)

    await user.click(screen.getByRole("button", { name: /open company modal/i }))

    const { companiesClient } = await import("@/api")
    expect(companiesClient.getCompany).toHaveBeenCalledWith("comp-1")
    expect(mockOpenModal).toHaveBeenCalledWith({ type: "company", companyId: "comp-1", company: mockCompany })
  })

  it("opens source modal after fetching source", async () => {
    const user = userEvent.setup()
    render(<QueueItemModalContent item={makeItem()} />)

    await user.click(screen.getByRole("button", { name: /open source modal/i }))

    const { jobSourcesClient } = await import("@/api")
    expect(jobSourcesClient.getJobSource).toHaveBeenCalledWith("source-1")
    expect(mockOpenModal).toHaveBeenCalledWith({ type: "jobSource", sourceId: "source-1", source: mockSource })
  })
})
