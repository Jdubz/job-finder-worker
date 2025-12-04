import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { JobMatchesClient } from "../job-matches-client"
import type { JobMatchWithListing } from "@shared/types"

const mockFetch = vi.fn()
global.fetch = mockFetch as any

const createMockMatch = (overrides: Partial<JobMatchWithListing> = {}): JobMatchWithListing => ({
  id: "match-1",
  jobListingId: "listing-1",
  matchScore: 88,
  matchedSkills: [],
  missingSkills: [],
  matchReasons: [],
  keyStrengths: [],
  potentialConcerns: [],
  experienceMatch: 80,
  customizationRecommendations: [],
  resumeIntakeData: undefined,
  analyzedAt: new Date(),
  createdAt: new Date(),
  submittedBy: null,
  queueItemId: "queue-1",
  listing: {
    id: "listing-1",
    url: "https://example.com/job",
    title: "Engineer",
    companyName: "ExampleCo",
    description: "Build stuff",
    location: "Remote",
    salaryRange: null,
    sourceId: null,
    companyId: null,
    postedDate: null,
    status: "analyzed",
    filterResult: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  ...overrides,
})

describe("JobMatchesClient", () => {
  const baseUrl = "https://api.example.com"
  let client: JobMatchesClient

  beforeEach(() => {
    vi.resetAllMocks()
    client = new JobMatchesClient(baseUrl)
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it("fetches matches with query parameters", async () => {
    const mockMatches: JobMatchWithListing[] = [createMockMatch()]

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { matches: mockMatches, count: 1 } }),
      headers: { get: () => "application/json" },
    } as unknown as Response)

    const matches = await client.listMatches({ minScore: 80 })

    expect(global.fetch).toHaveBeenCalledWith(
      `${baseUrl}/job-matches?minScore=80`,
      expect.objectContaining({ method: "GET", credentials: "include" })
    )
    expect(matches).toEqual(mockMatches)
  })

  it("handles legacy responses without a data wrapper", async () => {
    const mockMatches: JobMatchWithListing[] = [
      createMockMatch({
        id: "match-2",
        matchScore: 75,
        listing: {
          id: "listing-2",
          url: "https://example.com/job-2",
          title: "Analyst",
          companyName: "LegacyCo",
          description: "Analyze things",
          location: "Remote",
          salaryRange: null,
          sourceId: null,
          companyId: null,
          postedDate: null,
          status: "analyzed",
          filterResult: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      }),
    ]

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ matches: mockMatches, count: 1 }),
      headers: { get: () => "application/json" },
    } as unknown as Response)

    const matches = await client.listMatches()
    expect(matches).toEqual(mockMatches)
  })

  it("throws when match fetch fails", async () => {
    mockFetch.mockRejectedValue(new Error("network"))

    await expect(client.getMatch("missing")).rejects.toThrow("network")
  })

  it("polls matches via subscribeToMatches", async () => {
    const callback = vi.fn()
    const matches: JobMatchWithListing[] = []
    const spy = vi.spyOn(client, "listMatches").mockResolvedValue(matches)

    const unsubscribe = client.subscribeToMatches(callback, undefined, undefined, 0)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(callback).toHaveBeenCalled()
    expect(spy).toHaveBeenCalled()
    unsubscribe()
  })

  it("fetches match stats from server", async () => {
    const mockStats = {
      total: 10,
      highScore: 3,
      mediumScore: 5,
      lowScore: 2,
      averageScore: 72,
    }

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { stats: mockStats } }),
      headers: { get: () => "application/json" },
    } as unknown as Response)

    const stats = await client.getStats()

    expect(global.fetch).toHaveBeenCalledWith(
      `${baseUrl}/job-matches/stats`,
      expect.objectContaining({ method: "GET", credentials: "include" })
    )
    expect(stats).toEqual(mockStats)
  })

  it("unwraps legacy responses without data when fetching a single match", async () => {
    const mockMatch = createMockMatch({ id: "legacy-match" })

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ match: mockMatch }),
      headers: { get: () => "application/json" },
    } as unknown as Response)

    const result = await client.getMatch("legacy-match")
    expect(result).toEqual(mockMatch)
  })
})
