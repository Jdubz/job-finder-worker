import { describe, expect, it } from "vitest"
import { isPreFilterPolicy } from "../guards"
import type { PreFilterPolicy } from "../config.types"

const valid: PreFilterPolicy = {
  title: { requiredKeywords: ["engineer"], excludedKeywords: ["intern"] },
  freshness: { maxAgeDays: 30 },
  workArrangement: {
    allowRemote: true,
    allowHybrid: true,
    allowOnsite: false,
    willRelocate: false,
    userLocation: "Portland, OR",
    userTimezone: -8,
    maxTimezoneDiffHours: 4,
  },
  employmentType: { allowFullTime: true, allowPartTime: false, allowContract: true },
  salary: { minimum: 80000 },
  technology: { rejected: ["php"] },
}

describe("isPreFilterPolicy", () => {
  it("accepts a valid prefilter policy", () => {
    expect(isPreFilterPolicy(valid)).toBe(true)
  })

  it("rejects missing sections", () => {
    expect(isPreFilterPolicy({})).toBe(false)
  })

  it("rejects wrong title shapes", () => {
    const bad = { ...valid, title: { requiredKeywords: "engineer", excludedKeywords: [] } } as any
    expect(isPreFilterPolicy(bad)).toBe(false)
  })

  it("rejects non-numeric freshness", () => {
    const bad = { ...valid, freshness: { maxAgeDays: "thirty" } } as any
    expect(isPreFilterPolicy(bad)).toBe(false)
  })

  it("rejects invalid work arrangement", () => {
    const bad = { ...valid, workArrangement: { allowRemote: "yes" } } as any
    expect(isPreFilterPolicy(bad)).toBe(false)
  })

  it("rejects invalid timezone fields", () => {
    const bad = {
      ...valid,
      workArrangement: {
        ...valid.workArrangement,
        userTimezone: "west",
      },
    } as any
    expect(isPreFilterPolicy(bad)).toBe(false)
  })

  it("rejects invalid maxTimezoneDiffHours", () => {
    const bad = {
      ...valid,
      workArrangement: {
        ...valid.workArrangement,
        maxTimezoneDiffHours: "far",
      },
    } as any
    expect(isPreFilterPolicy(bad)).toBe(false)
  })

  it("allows missing optional timezone fields", () => {
    const ok: PreFilterPolicy = {
      ...valid,
      workArrangement: {
        allowRemote: true,
        allowHybrid: true,
        allowOnsite: true,
        willRelocate: false,
        userLocation: "Portland, OR",
      },
    }
    expect(isPreFilterPolicy(ok)).toBe(true)
  })

  it("rejects invalid relocation flags", () => {
    const bad = {
      ...valid,
      workArrangement: { allowRemote: true, allowHybrid: true, allowOnsite: true, willRelocate: "nope" },
    } as any
    expect(isPreFilterPolicy(bad)).toBe(false)
  })

  it("rejects invalid userLocation", () => {
    const bad = {
      ...valid,
      workArrangement: {
        allowRemote: true,
        allowHybrid: true,
        allowOnsite: true,
        willRelocate: true,
        userLocation: 123,
      },
    } as any
    expect(isPreFilterPolicy(bad)).toBe(false)
  })

  it("rejects empty userLocation when relocation disallowed", () => {
    const bad = {
      ...valid,
      workArrangement: {
        allowRemote: true,
        allowHybrid: true,
        allowOnsite: true,
        willRelocate: false,
        userLocation: "",
      },
    } as any
    expect(isPreFilterPolicy(bad)).toBe(false)
  })

  it("allows empty userLocation when relocation allowed", () => {
    const ok = {
      ...valid,
      workArrangement: {
        allowRemote: true,
        allowHybrid: true,
        allowOnsite: true,
        willRelocate: true,
        userLocation: " ",
      },
    } as any
    expect(isPreFilterPolicy(ok)).toBe(true)
  })

  it("rejects invalid employment type", () => {
    const bad = { ...valid, employmentType: { allowFullTime: true, allowPartTime: "maybe" } } as any
    expect(isPreFilterPolicy(bad)).toBe(false)
  })

  it("rejects invalid salary", () => {
    const bad = { ...valid, salary: { minimum: "100k" } } as any
    expect(isPreFilterPolicy(bad)).toBe(false)
  })

  it("rejects invalid technology list", () => {
    const bad = { ...valid, technology: { rejected: ["php", 123] } } as any
    expect(isPreFilterPolicy(bad)).toBe(false)
  })
})
