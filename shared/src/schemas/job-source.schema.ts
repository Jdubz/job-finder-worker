import { z } from "zod"
import { timestampJsonSchema } from "./timestamp.schema"

export const jobSourceSchema = z
  .object({
    id: z.string().optional(),
    name: z.string(),
    sourceType: z.string(),
    status: z.enum(["active", "paused", "disabled", "error"]),
    configJson: z.record(z.unknown()),
    tags: z.array(z.string()).nullable().optional(),
    companyId: z.string().nullable().optional(),
    aggregatorDomain: z.string().nullable().optional(),
    lastScrapedAt: timestampJsonSchema.nullable().optional(),
    createdAt: timestampJsonSchema.optional(),
    updatedAt: timestampJsonSchema.optional(),
  })
  .passthrough()

export const jobSourceStatsSchema = z.object({
  total: z.number(),
  byStatus: z
    .object({
      active: z.number().optional().default(0),
      paused: z.number().optional().default(0),
      disabled: z.number().optional().default(0),
      error: z.number().optional().default(0),
    })
    .passthrough(),
})
