import { describe, expect, it } from "vitest"
import { jobSourceSchema, jobSourceStatsSchema } from "@shared/types"

describe("Job Source contract fixtures", () => {
  it("empty list still conforms to schema array", () => {
    const parsed = jobSourceSchema.array().safeParse([])
    expect(parsed.success).toBe(true)
  })

  it("stats shape matches schema", () => {
    const parsed = jobSourceStatsSchema.safeParse({
      total: 0,
      byStatus: { active: 0, paused: 0, disabled: 0, error: 0 },
    })
    expect(parsed.success).toBe(true)
  })
})
