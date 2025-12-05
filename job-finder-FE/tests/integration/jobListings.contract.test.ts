import { describe, expect, it } from "vitest"
import { jobListingRecordSchema, jobListingStatsSchema } from "@shared/types"
import { mockJobListing } from "../fixtures/mockData"

describe("Job Listings contract fixtures", () => {
  it("listing fixture matches shared schema", () => {
    const parsed = jobListingRecordSchema.safeParse({
      ...mockJobListing,
      id: "listing-contract-fixture",
      companyName: mockJobListing.company,
      title: mockJobListing.title,
      description: mockJobListing.description,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sourceId: null,
      companyId: null,
      location: mockJobListing.location ?? null,
      salaryRange: null,
      postedDate: null,
      status: "pending",
      filterResult: null,
      analysisResult: null,
      matchScore: null,
      url: mockJobListing.url,
    })

    expect(parsed.success).toBe(true)
  })

  it("stats fixture respects schema shape", () => {
    const parsed = jobListingStatsSchema.safeParse({
      total: 1,
      pending: 1,
      analyzing: 0,
      analyzed: 0,
      skipped: 0,
      matched: 0,
    })

    expect(parsed.success).toBe(true)
  })
})
