import { z } from "zod"
import { timestampJsonSchema } from "./timestamp.schema"
import { jobListingRecordSchema } from "./job-listing.schema"

export const jobMatchSchema = z
  .object({
    id: z.string().optional(),
    jobListingId: z.string(),
    matchScore: z.number(),
    matchedSkills: z.array(z.string()),
    missingSkills: z.array(z.string()),
    matchReasons: z.array(z.string()),
    keyStrengths: z.array(z.string()),
    potentialConcerns: z.array(z.string()),
    experienceMatch: z.number(),
    customizationRecommendations: z.array(z.string()),
    resumeIntakeData: z.record(z.unknown()).optional(),
    analyzedAt: timestampJsonSchema,
    createdAt: timestampJsonSchema,
    updatedAt: timestampJsonSchema,
    submittedBy: z.string().nullable(),
    queueItemId: z.string(),
  })
  .passthrough()

export const jobMatchWithListingSchema = jobMatchSchema.extend({
  listing: jobListingRecordSchema,
  company: z.record(z.unknown()).nullable().optional(),
})

export const jobMatchStatsSchema = z.object({
  total: z.number(),
  highScore: z.number(),
  mediumScore: z.number(),
  lowScore: z.number(),
  averageScore: z.number(),
})
