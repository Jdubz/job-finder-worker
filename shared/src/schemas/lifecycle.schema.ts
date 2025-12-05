import { z } from "zod"
import { timestampJsonSchema } from "./timestamp.schema"

export const lifecycleEventSchema = z.object({
  id: z.string(),
  event: z.string(),
  data: z.record(z.string(), z.unknown()),
  ts: timestampJsonSchema,
})
