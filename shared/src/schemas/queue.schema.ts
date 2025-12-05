import { z } from "zod"
import { QUEUE_ITEM_TYPES, QUEUE_SOURCES, QUEUE_STATUSES } from "../queue.types"
import { timestampJsonSchema } from "./timestamp.schema"

export const queueItemSchema = z
  .object({
    id: z.string(),
    type: z.enum(QUEUE_ITEM_TYPES),
    status: z.enum(QUEUE_STATUSES),
    url: z.string().nullable().optional(),
    tracking_id: z.string().optional(),
    parent_item_id: z.string().nullable().optional(),
    input: z.record(z.string(), z.unknown()).nullable().optional(),
    output: z.record(z.string(), z.unknown()).nullable().optional(),
    result_message: z.string().nullable().optional(),
    error_details: z.string().nullable().optional(),
    created_at: timestampJsonSchema,
    updated_at: timestampJsonSchema,
    processed_at: timestampJsonSchema.nullable().optional(),
    completed_at: timestampJsonSchema.nullable().optional(),
    company_name: z.string().nullable().optional(),
    company_id: z.string().nullable().optional(),
    source: z.enum(QUEUE_SOURCES).optional(),
    submitted_by: z.string().nullable().optional(),
    scrape_config: z.record(z.string(), z.unknown()).nullable().optional(),
    scraped_data: z.record(z.string(), z.unknown()).nullable().optional(),
    source_discovery_config: z.record(z.string(), z.unknown()).nullable().optional(),
    source_id: z.string().nullable().optional(),
    source_type: z.string().nullable().optional(),
    source_config: z.record(z.string(), z.unknown()).nullable().optional(),
    source_tier: z.string().nullable().optional(),
    pipeline_state: z.record(z.string(), z.unknown()).nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .passthrough()

export const queueStatsSchema = z.object({
  pending: z.number(),
  processing: z.number(),
  success: z.number(),
  failed: z.number(),
  skipped: z.number(),
  total: z.number(),
})
