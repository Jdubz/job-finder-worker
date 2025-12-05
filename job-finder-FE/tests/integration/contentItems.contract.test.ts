import { describe, expect, it } from "vitest"
import { contentItemSchema } from "@shared/types"

describe("Content Items contract fixtures", () => {
  it("minimal content item tree conforms to schema", () => {
    const parsed = contentItemSchema.array().safeParse([
      {
        id: "content-1",
        parentId: null,
        order: 0,
        title: "Root",
        description: "Root item",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: "tester@example.com",
        updatedBy: "tester@example.com",
        children: [],
      },
    ])
    expect(parsed.success).toBe(true)
  })
})
