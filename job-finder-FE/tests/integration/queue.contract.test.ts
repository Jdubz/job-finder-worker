import { describe, expect, it } from "vitest"
import { queueItemSchema, queueStatsSchema } from "@shared/types"
import { mockQueueItem, mockQueueStats } from "../fixtures/mockData"

describe("Queue contract fixtures", () => {
  it("queue item fixture matches shared schema", () => {
    const parsed = queueItemSchema.safeParse({
      ...mockQueueItem,
      id: mockQueueItem.id || "queue-fixture",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    expect(parsed.success).toBe(true)
  })

  it("queue stats fixture matches shared schema", () => {
    const parsed = queueStatsSchema.safeParse(mockQueueStats)
    expect(parsed.success).toBe(true)
  })
})
