import { z } from "zod"

export const configEntrySchema = z.object({
  id: z.string(),
  payload: z.unknown(),
  updatedAt: z.string(),
  updatedBy: z.string().nullable().optional(),
})

export const configListSchema = z.object({
  configs: z.array(configEntrySchema),
})
