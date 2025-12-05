import { z } from "zod"
import type { ContentItemNode } from "../content-item.types"
import { timestampJsonSchema } from "./timestamp.schema"

export const contentItemSchema: z.ZodType<ContentItemNode> = z.lazy(() =>
  z
    .object({
      id: z.string(),
      parentId: z.string().nullable(),
      order: z.number(),
      title: z.string().nullable().optional(),
      role: z.string().nullable().optional(),
      location: z.string().nullable().optional(),
      website: z.string().nullable().optional(),
      startDate: z.string().nullable().optional(),
      endDate: z.string().nullable().optional(),
      description: z.string().nullable().optional(),
      skills: z.array(z.string()).nullable().optional(),
      aiContext: z
        .enum(["work", "highlight", "project", "education", "skills", "narrative", "section"])
        .nullable()
        .optional(),
      createdAt: timestampJsonSchema,
      updatedAt: timestampJsonSchema,
      createdBy: z.string(),
      updatedBy: z.string(),
      children: z.array(contentItemSchema).optional(),
    })
    .passthrough()
)
