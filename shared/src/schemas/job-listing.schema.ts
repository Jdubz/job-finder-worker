import { z } from "zod"
import { timestampJsonSchema } from "./timestamp.schema"

const nullableString = z.string().nullable().optional()

export const jobListingRecordSchema = z
  .object({
    id: z.string(),
    url: z.string(),
    sourceId: nullableString,
    companyId: nullableString,
    title: z.string(),
    companyName: z.string(),
    location: nullableString,
    salaryRange: nullableString,
    description: z.string(),
    postedDate: nullableString,
    status: z.enum(["pending", "analyzing", "analyzed", "skipped", "matched"]),
    filterResult: z.record(z.unknown()).nullable().optional(),
    analysisResult: z.unknown().nullable().optional(),
    matchScore: z.number().nullable().optional(),
    createdAt: timestampJsonSchema,
    updatedAt: timestampJsonSchema,
  })
  .passthrough()

export const jobListingStatsSchema = z.object({
  total: z.number(),
  pending: z.number(),
  analyzing: z.number(),
  analyzed: z.number(),
  skipped: z.number(),
  matched: z.number(),
})
