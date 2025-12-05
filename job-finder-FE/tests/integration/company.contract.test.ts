import { describe, expect, it } from "vitest"
import { companySchema } from "@shared/types"
import { mockCompany } from "../fixtures/mockData"

describe("Company contract fixtures", () => {
  it("company fixture matches shared schema", () => {
    const parsed = companySchema.safeParse({
      ...mockCompany,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      techStack: mockCompany.techStack ?? [],
    })
    expect(parsed.success).toBe(true)
  })
})
