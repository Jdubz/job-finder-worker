import { describe, it, expect } from "vitest"

import { getStageLabel } from "../queueItemDisplay"
import type { QueueItem } from "@shared/types"

const baseItem: QueueItem = {
  id: "q-1",
  type: "job",
  status: "pending",
  created_at: new Date(),
  updated_at: new Date(),
}

describe("queueItemDisplay#getStageLabel", () => {
  it("handles pipeline_state as JSON string without throwing", () => {
    const item: QueueItem = {
      ...baseItem,
      pipeline_state: JSON.stringify({ match_result: { score: 0.9 } }) as unknown as Record<string, any>,
    }

    expect(getStageLabel(item)).toBe("Save")
  })

  it("falls back safely when pipeline_state is malformed JSON", () => {
    const item: QueueItem = {
      ...baseItem,
      pipeline_state: "not-json-:-)" as unknown as Record<string, any>,
    }

    expect(getStageLabel(item)).toBe("Scrape")
  })

  it("falls back safely when pipeline_state is a primitive", () => {
    const item: QueueItem = {
      ...baseItem,
      pipeline_state: 42 as unknown as Record<string, unknown>,
    }

    expect(getStageLabel(item)).toBe("Scrape")
  })
})
