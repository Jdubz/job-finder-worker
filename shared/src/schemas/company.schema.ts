import { z } from "zod"
import { timestampJsonSchema } from "./timestamp.schema"

export const companySchema = z
  .object({
    id: z.string().optional(),
    name: z.string(),
    website: z.string().nullable().optional(),
    about: z.string().nullable().optional(),
    culture: z.string().nullable().optional(),
    mission: z.string().nullable().optional(),
    industry: z.string().nullable().optional(),
    headquartersLocation: z.string().nullable().optional(),
    companySizeCategory: z.enum(["large", "medium", "small"]).nullable().optional(),
    techStack: z.array(z.string()).nullable().optional(),
    createdAt: timestampJsonSchema.optional(),
    updatedAt: timestampJsonSchema.optional(),
  })
  .passthrough()
