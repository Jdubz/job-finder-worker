import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { JobMatchesClient } from "../job-matches-client"
import { auth } from "@/config/firebase"
import type { JobMatch } from "@shared/types"

vi.mock("@/config/firebase", () => ({
  auth: {
    currentUser: null,
  },
  appCheck: null,
}))

declare global {
  // eslint-disable-next-line no-var
  var fetch: ReturnType<typeof vi.fn>
}

global.fetch = vi.fn()

describe("JobMatchesClient", () => {
  const baseUrl = "https://api.example.com"
  let client: JobMatchesClient

  beforeEach(() => {
    vi.resetAllMocks()
    client = new JobMatchesClient(baseUrl)
  })

  afterEach(() => {
    (auth as any).currentUser = null
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
        analyzedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        submittedBy: null,
        queueItemId: "queue-1",
      },
    ]

    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { matches: mockMatches, count: 1 } }),
      headers: { get: () => 'application/json' },
    } as Response)

    const matches = await client.getMatches({ minScore: 80 })

    expect(global.fetch).toHaveBeenCalledWith(
      `${baseUrl}/job-matches?minScore=80`,
      expect.objectContaining({ method: "GET" })
    )
    expect(matches).toEqual(mockMatches)
  })

  it("returns null when match fetch fails", async () => {
    global.fetch.mockRejectedValue(new Error("network"))

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
})
