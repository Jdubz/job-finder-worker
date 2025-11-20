import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { JobMatchesClient } from "../job-matches-client"
import type { JobMatch } from "@shared/types"
import { getStoredAuthToken } from "@/lib/auth-storage"

vi.mock("@/lib/auth-storage", () => ({
  getStoredAuthToken: vi.fn(() => null),
  storeAuthToken: vi.fn(),
  clearStoredAuthToken: vi.fn(),
}))

const mockFetch = vi.fn()
global.fetch = mockFetch as any

describe("JobMatchesClient", () => {
  const baseUrl = "https://api.example.com"
  let client: JobMatchesClient

  beforeEach(() => {
    vi.resetAllMocks()
    client = new JobMatchesClient(baseUrl)
  })

  afterEach(() => {
    vi.mocked(getStoredAuthToken).mockReturnValue(null)
  })

  it("fetches matches with query parameters", async () => {
    const mockMatches: JobMatch[] = [
      {
        id: "match-1",
        url: "https://example.com/job",
        companyName: "ExampleCo",
        companyId: "co-1",
        jobTitle: "Engineer",
        location: "Remote",
        salaryRange: null,
        jobDescription: "Build stuff",
        companyInfo: null,
        matchScore: 88,
        matchedSkills: [],
        missingSkills: [],
        matchReasons: [],
        keyStrengths: [],
        potentialConcerns: [],
        experienceMatch: 80,
        applicationPriority: "High",
        customizationRecommendations: [],
        resumeIntakeData: undefined,
        analyzedAt: new Date(),
        createdAt: new Date(),
        submittedBy: null,
        queueItemId: "queue-1",
      },
    ]

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { matches: mockMatches, count: 1 } }),
      headers: { get: () => 'application/json' },
    } as unknown as Response)

    const matches = await client.getMatches({ minScore: 80 })

    expect(global.fetch).toHaveBeenCalledWith(
      `${baseUrl}/job-matches?minScore=80`,
      expect.objectContaining({ method: "GET" })
    )
    expect(matches).toEqual(mockMatches)
  })

  it("handles legacy responses without a data wrapper", async () => {
    const mockMatches: JobMatch[] = [
      {
        id: "match-2",
        url: "https://example.com/job-2",
        companyName: "LegacyCo",
        companyId: "co-2",
        jobTitle: "Analyst",
        location: "Remote",
        salaryRange: null,
        jobDescription: "Analyze things",
        companyInfo: null,
        matchScore: 75,
        matchedSkills: [],
        missingSkills: [],
        matchReasons: [],
        keyStrengths: [],
        potentialConcerns: [],
        experienceMatch: 70,
        applicationPriority: "Medium",
        customizationRecommendations: [],
        resumeIntakeData: undefined,
        analyzedAt: new Date(),
        createdAt: new Date(),
        submittedBy: null,
        queueItemId: "queue-2",
      },
    ]

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ matches: mockMatches, count: 1 }),
      headers: { get: () => "application/json" },
    } as unknown as Response)

    const matches = await client.getMatches()
    expect(matches).toEqual(mockMatches)
  })

  it("returns null when match fetch fails", async () => {
    mockFetch.mockRejectedValue(new Error("network"))

    const result = await client.getMatch("missing")

    expect(result).toBeNull()
  })

  it("polls matches via subscribeToMatches", async () => {
    const callback = vi.fn()
    const matches: JobMatch[] = []
    const spy = vi.spyOn(client, "getMatches").mockResolvedValue(matches)

    const unsubscribe = client.subscribeToMatches(callback, undefined, undefined, 0)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(callback).toHaveBeenCalled()
    expect(spy).toHaveBeenCalled()
    unsubscribe()
  })

  it("calculates match stats", async () => {
    const matches: JobMatch[] = [
      { applicationPriority: "High" } as JobMatch,
      { applicationPriority: "Medium" } as JobMatch,
      { applicationPriority: "Low" } as JobMatch,
    ]
    vi.spyOn(client, "getMatches").mockResolvedValue(matches)

    const stats = await client.getMatchStats()

    expect(stats.total).toBe(3)
    expect(stats.highPriority).toBe(1)
    expect(stats.mediumPriority).toBe(1)
    expect(stats.lowPriority).toBe(1)
  })

  it("unwraps legacy responses without data when fetching a single match", async () => {
    const mockMatch = {
      id: "legacy-match",
      url: "https://example.com/legacy",
      companyName: "LegacyCo",
      jobTitle: "Legacy Engineer",
      matchScore: 90,
      applicationPriority: "High",
    } as JobMatch

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ match: mockMatch }),
      headers: { get: () => "application/json" },
    } as unknown as Response)

    const result = await client.getMatch("legacy-match")
    expect(result).toEqual(mockMatch)
  })
})
